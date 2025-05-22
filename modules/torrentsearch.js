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

import axios from 'axios';

export default {
  name: '.trs',
  description: 'Fetch torrents from PirateBay and return top magnet links',
  usage: '.trs <search-term> to find torrents',

  async execute(msg, args, sock) {
    const sender = msg.key.remoteJid;

    if (!args.length) {
      await sock.sendMessage(
        sender,
        { text: 'No arguments given for search' },
        { quoted: msg }
      );
      return;
    }

    const query = args.join(' ');
    const baseUrl = 'https://news-api-six-navy.vercel.app/api/torrent/piratebay';
    const results = [];

    try {
      const res = await axios.get(`${baseUrl}/${encodeURIComponent(query)}/1`);
      const torrents = res.data;

      if (!torrents.length) {
        await sock.sendMessage(
          sender,
          { text: `No results found for *${query}*.` },
          { quoted: msg }
        );
        return;
      }

      torrents.forEach(torrent => {
        results.push({
          Name: torrent.Name || 'N/A',
          Size: torrent.Size || 'N/A',
          Category: torrent.Category || 'N/A',
          DateUploaded: torrent.DateUploaded || 'N/A',
          Seeders: torrent.Seeders || 'N/A',
          Leechers: torrent.Leechers || 'N/A',
          Magnet: torrent.Magnet || 'N/A',
        });
      });

      let reply = `*Search results for "${query}"*:\n\n`;

      results.forEach(result => {
        reply +=
          `*Name:* ${result.Name}\n` +
          `*Size:* ${result.Size}\n` +
          `*Category:* ${result.Category}\n` +
          `*Upload Date:* ${result.DateUploaded}\n` +
          `*Seeders:* ${result.Seeders}\n` +
          `*Leechers:* ${result.Leechers}\n` +
          `*Magnet Link:*\n${result.Magnet}\n\n`;
      });

      await sock.sendMessage(sender, { text: reply.trim() }, { quoted: msg });
    } catch (err) {
      console.error('Error fetching from PirateBay:', err.message);
      await sock.sendMessage(
        sender,
        { text: 'An error occurred while fetching torrent data from PirateBay.' },
        { quoted: msg }
      );
    }
  },
};

