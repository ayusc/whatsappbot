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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let autoDPStarted = false;
let autoBioStarted = false;

const mongoUri = process.env.MONGO_URI;
const authDir = './wahbuddy-auth';
const dbName = 'wahbuddy';
let db, sessionCollection, sockInstance;
const app = express();
const PORT = process.env.PORT || 8000;
const SITE_URL = process.env.SITE_URL;

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
  console.log('Attempting to restore previous session from MongoDB');

  const savedCreds = await sessionCollection.find({}).toArray();
  if (!savedCreds.length) {
    console.warn('No session found in MongoDB. Will require QR login.');
    return;
  } else {
    console.log(`Found WahBuddy's session entries in MongoDB !`);
  }

  fs.mkdirSync(authDir, { recursive: true });

  for (const { _id, data } of savedCreds) {
    const filePath = path.join(authDir, _id);
    fs.writeFileSync(filePath, data, 'utf-8');
  }

  console.log('Session successfully restored from MongoDB');
}

// export these collections
export let chatsCollection;
export let messagesCollection;
export let contactsCollection;

async function startBot() {
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  db = mongoClient.db(dbName);
  sessionCollection = db.collection('wahbuddy_sessions');
  chatsCollection = db.collection('chats');
  messagesCollection = db.collection('messages');
  contactsCollection = db.collection('contacts');
  console.log('Connected to MongoDB');

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
    logger: pino({ level: 'silent' }),
  });

  sockInstance = sock;

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
      if (qr) {
        console.log('Scan the QR code below: ');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error instanceof Boom &&
          lastDisconnect.error.output?.statusCode !==
            DisconnectReason.loggedOut;
        console.log('Connection closed. Reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          startBot();
        }
      } else if (connection === 'open') {
        console.log('Authenticated with WhatsApp');

        const commands = new Map();
        const modulesPath = path.join(__dirname, 'modules');
        const moduleFiles = fs
          .readdirSync(modulesPath)
          .filter(file => file.endsWith('.js'));

        for (const file of moduleFiles) {
          const module = await import(`./modules/${file}`);
          if (module.default?.name && module.default?.execute) {
            commands.set(module.default.name, module.default);
            console.log(`Loaded command: ${module.default.name}`);
          } else {
            console.warn(`Skipped invalid module: ${file}`);
          }
        }

        const autoDP = process.env.ALWAYS_AUTO_DP || 'False';
        const autobio = process.env.ALWAYS_AUTO_BIO || 'False';
        const SHOW_HOROSCOPE = process.env.SHOW_HOROSCOPE || 'False';

        const fakeMessage = {
          key: { remoteJid: sock.user.id },
          pushName: sock.user.name || 'WahBuddy',
          message: {},
          participant: sock.user.id,
          fromStartup: true,
        };

        if (SHOW_HOROSCOPE !== 'True' && SHOW_HOROSCOPE !== 'False') {
          throw new Error(
            'SHOW_HOROSCOPE must be "True" or "False" (as string). Received: ' +
              SHOW_HOROSCOPE
          );
        }

        if (autoDP === 'True' && !autoDPStarted) {
          autoDPStarted = true;
          if (commands.has('.autodp')) {
            try {
              await commands.get('.autodp').execute(fakeMessage, [], sock);
              console.log('AutoDP enabled');
            } catch (error) {
              console.error('Failed to enable AutoDP', error);
            }
          } else {
            console.warn('.autodp command not found');
          }
        }

        if (autobio === 'True' && !autoBioStarted) {
          autoBioStarted = true;
          if (commands.has('.autobio')) {
            try {
              await commands.get('.autobio').execute(fakeMessage, [], sock);
              console.log('AutoBio enabled');
            } catch (error) {
              console.error('Failed to enable AutoBio', error);
            }
          } else {
            console.warn('.autobio command not found');
          }
        }
      }
    }
  );

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

  sock.ev.on(
    'messaging-history.set',
    async ({ chats, contacts, messages, isLatest }) => {
      //console.log('messaging-history.set event triggered');
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
    }
  );
}

app.get('/', (req, res) => {
  res.json({ status: 'Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`HTTP server running on ${SITE_URL}`);
});

function startSelfPing() {
  setInterval(async () => {
    try {
      await axios.get(`https://${SITE_URL}/health`);
    } catch (err) {
      console.error('Error in HTTP server:', err.message);
    }
  }, 60 * 1000);
}

startBot();
startSelfPing();
