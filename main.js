//  WahBuddy - A simple whatsapp userbot written in pure js
//  Copyright (C) 2025-present Ayus Chatterjee
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.

//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.

//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} from 'baileys';
import { Boom } from '@hapi/boom';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import express from 'express';
import axios from 'axios';
import { fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import './app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let autoDPStarted = false;
let autoBioStarted = false;
const autoDP = process.env.ALWAYS_AUTO_DP || 'False';
const autobio = process.env.ALWAYS_AUTO_BIO || 'False';
const mongoUri = process.env.MONGO_URI;
const authDir = './wahbuddy-auth';
const dbName = 'wahbuddy';
let db, sessionCollection

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

async function saveAuthStateToMongo(attempt = 1) {
  try {
    if (!fs.existsSync(authDir)) {
      console.warn(`${authDir} does not exist. Skipping save.`);
      return;
    }

    const staging = db.collection('wahbuddy_sessions_staging');
    const main = sessionCollection;

    const files = fs.readdirSync(authDir);
    for (const file of files) {
      const filePath = path.join(authDir, file);
      const data = fs.readFileSync(filePath, 'utf-8');

      await staging.updateOne(
        { _id: file },
        { $set: { data } },
        { upsert: true }
      );
    }

    const staged = await staging.find({}).toArray();
    for (const doc of staged) {
      await main.updateOne(
        { _id: doc._id },
        { $set: { data: doc.data } },
        { upsert: true }
      );
    }

    await staging.deleteMany({});
    console.log('Session credentials successfully saved/updated in MongoDB.');
  } catch (err) {
    if (attempt < 5) {
      console.warn(`Retrying creds update... attempt ${attempt + 1}`);
      await saveAuthStateToMongo(attempt + 1);
    } else {
      console.error(
        `Failed to update creds in MongoDB after ${attempt} attempts:`,
        err
      );
    }
  }
}

async function restoreAuthStateFromMongo() {

  const savedCreds = await sessionCollection.find({}).toArray();
  if (!savedCreds.length) {
    console.warn('No session found in MongoDB. Will require QR login.');
    return;
  } 

  fs.mkdirSync(authDir, { recursive: true });

  for (const { _id, data } of savedCreds) {
    const filePath = path.join(authDir, _id);
    fs.writeFileSync(filePath, data, 'utf-8');
  }

  if (initialConnect) console.log('Session successfully restored from MongoDB');
}

// export these collections
export let chatsCollection;
export let messagesCollection;
export let contactsCollection;

let mongoConnected = false;
let commandsLoaded = false;
let initialConnect = true;

const commands = new Map(); 
const msgRetryCounterCache = new NodeCache();

async function startBot() {
  const mongoClient = new MongoClient(mongoUri);
  if (!mongoConnected) {
    await mongoClient.connect();
    mongoConnected = true;
    if (initialConnect) console.log('Connected to MongoDB');
  }
  db = mongoClient.db(dbName);
  sessionCollection = db.collection('wahbuddy_sessions');
  chatsCollection = db.collection('chats');
  messagesCollection = db.collection('messages');
  contactsCollection = db.collection('contacts');

  fs.mkdirSync(authDir, { recursive: true });

  await restoreAuthStateFromMongo();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const getMessage = async key => {
    const message = await messagesCollection.findOne({ 'key.id': key.id });
    return message?.message || null;
  };

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true,
    getMessage,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache,
    logger: pino({ level: 'silent' }),
    qrTimeout: 2147483647,
  });

  sock.ev.on(
    'creds.update',
    debounce(async () => {
      await saveCreds();
      await saveAuthStateToMongo();
    }, 1000)
  );

  sock.ev.on(
    'connection.update',
    async ({ connection, lastDisconnect, qr }) => {
      if (qr && initialConnect) {
        console.log('Scan the QR code below: ');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        commandsLoaded = false; 
        const shouldReconnect =
          lastDisconnect?.error instanceof Boom &&
          lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed. Reconnecting ...');
        if (shouldReconnect) {
          startBot();
        }

      } else if (connection === 'open') {
  
        if (initialConnect) {
          console.log('Authenticated with WhatsApp');
        }

        if (!commandsLoaded) {
          const modulesPath = path.join(__dirname, 'modules');
          const moduleFiles = fs
            .readdirSync(modulesPath)
            .filter(file => file.endsWith('.js'));
        
          for (const file of moduleFiles) {
            const module = await import(`./modules/${file}`);
            if (module.default?.name && module.default?.execute) {
              commands.set(module.default.name, module.default);
              // Only log during initial startup
              if (initialConnect) {
                console.log(`Loaded command: ${module.default.name}`);
              }
            }
          }
          commandsLoaded = true; 
        }

        if (initialConnect) {
          console.log('WahBuddy is Online !');
        }
        
        initialConnect = false;

        if (!autoDPStarted && autoDP === 'True' && commands.has('.autodp')) {
        autoDPStarted = true;
        try {
          const { startAutoDP } = await import('./modules/autodp.js');
          await startAutoDP(sock);
        } catch (error) {
          console.error(`AutoDP Error: ${error.message}`);
        }
        }
      
        if (!autoBioStarted && autobio === 'True' && commands.has('.autobio')) {
        autoBioStarted = true;
        try {
          const { startAutoBio } = await import('./modules/autobio.js');
          await startAutoBio(sock);
        } catch (error) {
          console.error(`AutoBio Error: ${error.message}`);
        }
      }
      }
  });

  sock.ev.on('chats.upsert', async chats => {
    for (const chat of chats) {
      await chatsCollection.updateOne(
        { id: chat.id },
        { $set: chat },
        { upsert: true }
      );
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!messages || !messages.length) return;
  
    for (const msg of messages) {
      await messagesCollection.updateOne(
        { 'key.id': msg.key.id },
        { $set: msg },
        { upsert: true }
      );
    }
  
    if (type !== 'notify') return;
  
    const msg = messages[0];
    if (!msg.message) return;
  
    if (msg.key.fromMe) {
      const messageContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';
  
      const args = messageContent.trim().split(/\s+/);
      const command = args.shift().toLowerCase();
  
      if (commands.has(command)) {
        try {
          await commands.get(command).execute(msg, args, sock);
        } catch (err) {
          console.error(`Error executing ${command}:`, err);
        }
      }
    }
  });

  sock.ev.on('contacts.upsert', async contacts => {
    for (const contact of contacts) {
      await contactsCollection.updateOne(
        { id: contact.id },
        { $set: contact },
        { upsert: true }
      );
    }
  });

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    for (const chat of chats) {
      await chatsCollection.updateOne(
        { id: chat.id },
        { $set: chat },
        { upsert: true }
      );
    }

    for (const contact of contacts) {
      await contactsCollection.updateOne(
        { id: contact.id },
        { $set: contact },
        { upsert: true }
      );
    }

    for (const message of messages) {
      await messagesCollection.updateOne(
        { key: message.key },
        { $set: message },
        { upsert: true }
      );
    }
    console.log('Full sync done !');
  });
}

startBot();
