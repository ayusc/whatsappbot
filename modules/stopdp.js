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

export default {
  name: '.stopdp',
  description: 'Stop updating WhatsApp profile picture automatically.',
  usage:
    'Type .stopdp in any chat to stop updating WhatsApp profile picture automatically.',

  async execute(message, args, sock) {
    if (globalThis.autodpInterval) {
      clearInterval(globalThis.autodpInterval);
      globalThis.autodpInterval = null;
      globalThis.autodpRunning = false;
      await sock.sendMessage(
        message.key.remoteJid,
        { text: 'AutoDP stopped' },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(
        message.key.remoteJid,
        { text: 'AutoDP is not running' },
        { quoted: message }
      );
    }
  },
};
