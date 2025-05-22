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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all other command modules in this folder
const commandsList = [];
const commandFiles = fs
  .readdirSync(__dirname)
  .filter(file => file.endsWith('.js') && file !== 'help.js');

for (const file of commandFiles) {
  const filePath = path.join(__dirname, file);
  const { default: command } = await import(`file://${filePath}`);
  if (command?.name && command?.description) {
    commandsList.push(command);
  }
}

export default {
  name: '.help',
  description: 'Lists all commands or shows usage for a specific command',

  async execute(msg, args, sock) {
    const prefix = '.';
    const chatId = msg.key.remoteJid;

    if (args.length > 0) {
      const query = prefix + args[0];
      const cmd = commandsList.find(c => c.name === query);

      if (!cmd) {
        const text = 'Command not found: ' + args[0];
        await sock.sendMessage(chatId, { text }, { quoted: msg });
        return;
      }

      const usage = cmd.usage || cmd.description;
      const text = `Usage for ${cmd.name}:\n\n${usage}`;
      await sock.sendMessage(chatId, { text }, { quoted: msg });
      return;
    }

    // No argument: list all commands
    let text = 'Hi there, welcome to WahBuddy\n\n';
    text += 'A userbot for WhatsApp written in pure JavaScript\n\n';
    text += 'Here are all the bot commands:\n';
    text += 'To know command usage please type `.help {command}`\n\n';

    for (const c of commandsList) {
      text += `\`${c.name}\`: ${c.description}\n\n`;
    }

    await sock.sendMessage(chatId, { text: text.trim() }, { quoted: msg });
  },
};
