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
  description: 'Fetch torrents from multiple sources and return top magnet links',
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
    const baseUrl = 'https://news-api-six-navy.vercel.app/api/torrent';
    const sources = ['piratebay', '1337x', 'nyaasi', 'yts'];
    const results = [];
    let successfulSources = 0;

    try {
      const fetchPromises = sources.map(async (source) => {
        try {
          const res = await axios.get(`${baseUrl}/${source}/${encodeURIComponent(query)}/1`, { timeout: 10000 });
          const torrents = res.data?.torrents?.slice(0, 5) || [];
          if (torrents.length) successfulSources++;

          torrents.forEach(torrent => {
            results.push({
              Name: torrent.name || 'N/A',
              Size: torrent.size || 'N/A',
              DateUploaded: torrent.date || torrent.uploaded || 'N/A',
              Seeders: torrent.seeders || 'N/A',
              Leechers: torrent.leechers || 'N/A',
              Downloads: torrent.downloads || 'N/A',
              Magnet: torrent.magnet || 'N/A',
            });
          });
        } catch (err) {
          console.error(`Failed to fetch from ${source}:`, err.message);
        }
      });

      await Promise.all(fetchPromises);

      if (!results.length || successfulSources === 0) {
        await sock.sendMessage(
          sender,
          { text: `❌ Could not fetch results from any source for *${query}*.` },
          { quoted: msg }
        );
        return;
      }

      let reply = `*Search results for "${query}"*:\n\n`;

      results.forEach(result => {
        reply +=
          `*Name:* ${result.Name}\n` +
          `*Size:* ${result.Size}\n` +
          `*Upload Date:* ${result.DateUploaded}\n` +
          `*Seeders:* ${result.Seeders}\n` +
          `*Leechers:* ${result.Leechers}\n` +
          `*Downloads:* ${result.Downloads}\n` +
          `*Magnet Link:*\n${result.Magnet}\n\n`;
      });

      await sock.sendMessage(sender, { text: reply.trim() }, { quoted: msg });
    } catch (err) {
      console.error('Unexpected error during torrent fetch:', err.message);
      await sock.sendMessage(
        sender,
        { text: 'An unexpected error occurred while fetching torrent data.' },
        { quoted: msg }
      );
    }
  },
};

