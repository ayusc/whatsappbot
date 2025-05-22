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
  description: 'Fetch torrents from various providers and return magnet links',
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
    const url = `https://torrent.exonoob.in/api/all/${encodeURIComponent(query)}/1`;
    let results = [];

    try {
      const { data } = await axios.get(url, { timeout: 10000 });

      if (Array.isArray(data[0])) {
        results.push(...data[0]);
      }

      if (Array.isArray(data[1])) {
        for (const movie of data[1]) {
          if (movie.Files && movie.Files.length > 0) {
            for (const file of movie.Files) {
              results.push({
                Name: movie.Name,
                Size: file.Size,
                DateUploaded: movie.ReleasedDate,
                Seeders: 'N/A',
                Leechers: 'N/A',
                Downloads: movie.Likes || 'N/A',
                Magnet: file.Magnet,
              });
            }
          }
        }
      }

      if (!results.length) {
        await sock.sendMessage(
          sender,
          { text: `No results found for *${query}*` },
          { quoted: msg }
        );
        return;
      }

      let reply = `*Search results for ${query}*\n\n`;

      for (const result of results) {
        reply +=
          `*Name:* ${result.Name || 'N/A'}\n` +
          `*Size:* ${result.Size || 'N/A'}\n` +
          `*Upload Date:* ${result.DateUploaded || 'N/A'}\n` +
          `*Seeders:* ${result.Seeders || 'N/A'}\n` +
          `*Leechers:* ${result.Leechers || 'N/A'}\n` +
          `*Downloads:* ${result.Downloads || 'N/A'}\n` +
          `*Magnet Link:*\n${result.Magnet || 'N/A'}\n\n`;
      }

      await sock.sendMessage(sender, { text: reply.trim() }, { quoted: msg });
    } catch (err) {
      console.error('Error fetching torrents:', err.message);
      await sock.sendMessage(
        sender,
        { text: 'Something went wrong while fetching results.' },
        { quoted: msg }
      );
    }
  },
};
