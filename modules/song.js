import axios from 'axios';
import yts from 'yt-search';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import ffmpegPath from 'ffmpeg-static';

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

function withCommas(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default {
  name: '.song',
  description: 'Searches and sends a song from YouTube as an MP3.',
  usage: 'Type .song <song name> to upload the requested song in the chat',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const query = body.split(' ').slice(1).join(' ').trim();

    if (!query) {
      return await sock.sendMessage(jid, { text: 'Please enter a song name to download' });
    }

    try {
      const search = await yts(query);
      const result = search.videos[0];
      if (!result) {
        return await sock.sendMessage(jid, { text: 'No matching songs found.' });
      }

      const tempDir = path.resolve('./temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const timeStamp = Date.now();
      const rawAudio = path.join(tempDir, `${timeStamp}.m4a`);
      const finalAudio = path.join(tempDir, `${timeStamp}.mp3`);
      const link = result.url;

      const apis = [
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(link)}`,
        `https://api.zenkey.my.id/api/download/ytmp3?apikey=zenkey&url=${encodeURIComponent(link)}`,
      ];

      let downloaded = false;

      let progressMsg = await sock.sendMessage(
        jid,
        {
          text: `*Song Information:*\n\nName: ${result.title}\n\nDuration: ${result.timestamp}\n\nViews: ${result.views}\n\n_Downloading your song ..._`
        },
        { quoted: msg }
      );

      for (const api of apis) {
        try {
          const res = await fetch(api);
          const json = await res.json();
          const downloadUrl = json?.data?.dl || json?.result?.downloadUrl;
          if (!downloadUrl) continue;

          const audioBuffer = await fetch(downloadUrl).then(r => r.buffer());
          fs.writeFileSync(rawAudio, audioBuffer);

          const execFileAsync = util.promisify(execFile);

          await execFileAsync(ffmpegPath, [
            '-i', rawAudio,
            '-vn',
            '-acodec', 'libmp3lame',
            '-ac', '2',
            '-ab', '128k',
            '-ar', '44100',
            finalAudio
          ]);
          
          if (fs.statSync(finalAudio).size < 1024) {
            console.error('Corrupt song file');
            await sock.sendMessage(jid, 
            { text: 'Some Error Occured !', edit: progressMsg.key },
            { quoted: msg },                
            );
          }
          
          await sock.sendMessage(
          jid,
          { text: `*Song Information:*\n\nName: ${result.title}\n\nDuration: ${result.timestamp}\n\nViews: ${result.views}\n\n_Uploading your song ..._`, edit: progressMsg.key }, 
          { quoted: msg }
          );
          
          await sock.sendMessage(
            jid,
            {
              audio: { url: finalAudio },
              mimetype: 'audio/mpeg',
              fileName: `${result.title}.mp3`,
              ptt: false
            },
            { quoted: msg }
          );

          downloaded = true;
          break;
        } catch (err) {
          console.error('Error with API:', api, err.message);
        }
      }

      if (!downloaded) {
        console.error('All sources failed.');
        await sock.sendMessage(jid, 
        { text: 'Unable to download the song.\nAPI Down !', edit: progressMsg.key },
        { quoted: msg },                
        );
      }

      setTimeout(() => {
        [rawAudio, finalAudio].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
      }, 5000);
    } catch (err) {
      console.error('Song command error:', err);
      await sock.sendMessage(jid, 
        { text: 'Unable to download the song !\nTry again later or try with a different song name.', edit: progressMsg.key },
        { quoted: msg },                
      );
    }
  }
};
