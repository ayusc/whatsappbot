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
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';
import sharp from 'sharp';
import fetch from 'node-fetch';
import weather from 'weather-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const city = process.env.CITY || 'Kolkata';
const ZODIAC_SIGN = process.env.ZODIAC_SIGN || 'Gemini';
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Kolkata';
const imageUrl =
  process.env.IMAGE_URL ||
  'https://i.ibb.co/d4qcHwdj/blank-profile-picture-973460-1280.png';
const intervalMs =
  Number.parseInt(process.env.AUTO_DP_INTERVAL_MS, 10) || 60_000;
const SHOW_HOROSCOPE = process.env.SHOW_HOROSCOPE || 'False';
let lastFetchedHoroscope = null;
let lastFetchedTime = 0;

globalThis.autodpInterval = globalThis.autodpInterval || null;
const fontPath = path.join(__dirname, 'Lobster-Regular.ttf');
const fontUrl =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/lobster/Lobster-Regular.ttf';

function getDateTimeString() {
  const options = { timeZone: TIME_ZONE, hour12: true };
  const now = new Date();

  const day = now.toLocaleString('en-IN', { weekday: 'short', ...options });
  const dd = now.toLocaleString('en-IN', { day: '2-digit', ...options });
  const mm = now.toLocaleString('en-IN', { month: '2-digit', ...options });
  const yyyy = now.toLocaleString('en-IN', { year: 'numeric', ...options });
  let time = now.toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  });

  // Convert "AM"/"PM" to "A.M"/"P.M"
  time = time.replace(/\s?am/, ' A.M').replace(/\s?pm/, ' P.M');

  return `${day} ${dd}.${mm}.${yyyy} ${time}`;
}

async function ensureFontDownloaded() {
  if (fs.existsSync(fontPath) && fs.statSync(fontPath).size >= 10_000) return;

  await new Promise((resolve, reject) => {
    https
      .get(fontUrl, res => {
        if (res.statusCode !== 200)
          return reject(
            new Error(`Failed to download font: ${res.statusCode}`)
          );

        const file = fs.createWriteStream(fontPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

const imagePath = path.join(__dirname, 'dp.jpg');
const outputImage = path.join(__dirname, 'output.jpg');

async function downloadImage(imagePath) {
  const MAX_RETRIES = 3;

  async function tryRandomImage(attempt = 1) {
    try {
      const response = await fetch('https://picsum.photos/1500/1000', {
        redirect: 'follow',
      });

      if (!response.ok) {
        console.warn(`Attempt ${attempt} - Bad response: ${response.status}`);
        if (attempt < MAX_RETRIES) {
          return await tryRandomImage(attempt + 1);
        }
        return false;
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(imagePath, Buffer.from(buffer));
      return true;
    } catch (error) {
      console.error(
        `Attempt ${attempt} - Failed to fetch random image:`,
        error.message
      );
      if (attempt < MAX_RETRIES) {
        return await tryRandomImage(attempt + 1);
      }
      return false;
    }
  }

  return await tryRandomImage();
}

async function getWeather() {
  return new Promise(resolve => {
    weather.find({ search: city, degreeType: 'C' }, function (error, result) {
      if (error || !result || result.length === 0) {
        console.log('Failed to get weather:', error?.message || 'No results');
        return resolve({
          temperature: 'N/A',
          feelsLike: 'N/A',
          sky: 'N/A',
          windSpeed: 'N/A',
          humidity: 'N/A',
          forecastText: 'N/A',
          rainChance: 'N/A',
        });
      }

      const current = result[0].current || {};
      const forecast = result[0].forecast?.[0] || {};

      const weatherDetails = {
        temperature: current.temperature ? current.temperature + '°C' : 'N/A',
        feelsLike: current.feelslike ? current.feelslike + '°C' : 'N/A',
        sky: current.skytext || 'N/A',
        windSpeed: current.winddisplay || 'N/A',
        humidity: current.humidity ? current.humidity + '%' : 'N/A',
        forecastText: forecast.skytextday || 'N/A',
        rainChance: forecast.precip ? forecast.precip + '%' : 'N/A',
      };

      resolve(weatherDetails);
    });
  });
}

async function getAQI(cityName) {
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`
    );
    const geoData = await geoRes.json();
    if (geoData.length === 0) throw new Error('City not found');

    const { lat, lon } = geoData[0];

    const aqiRes = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`
    );
    const aqiData = await aqiRes.json();

    const aqi = aqiData?.current?.us_aqi;

    if (typeof aqi !== 'number') throw new Error('Invalid AQI data');

    let status = 'N/A';
    if (aqi <= 20) status = 'Excellent';
    else if (aqi <= 50) status = 'Good';
    else if (aqi <= 100) status = 'Moderate';
    else if (aqi <= 125) status = 'Poor';
    else if (aqi <= 150) status = 'Unhealthy for Sensitive Groups';
    else if (aqi <= 200) status = 'Unhealthy';
    else if (aqi <= 300) status = 'Very Unhealthy';
    else status = 'Hazardous';

    return {
      aqi: aqi.toString(),
      status,
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      aqi: 'N/A',
      status: 'N/A',
    };
  }
}

async function getHoroscopes() {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();

  if (lastFetchedHoroscope && now - lastFetchedTime < ONE_HOUR) {
    return lastFetchedHoroscope;
  }

  try {
    const response = await fetch(`https://api.api-ninjas.com/v1/horoscope?zodiac=${ZODIAC_SIGN}`);
    const data = await response.json();
    const daily = data?.horoscope || 'N/A';
    const sign = data?.sign || 'N/A';
    lastFetchedHoroscope = { sign, daily };
    lastFetchedTime = now;
    return lastFetchedHoroscope;
  } catch (error) {
    console.error("Failed to fetch today's horoscope:", error);
    return {
      sign: 'N/A',
      daily: "Unable to fetch today's horoscope.",
    };
  }
}

async function generateImage() {
  await downloadImage(imagePath);

  if (!fs.existsSync(imagePath)) {
    console.error('Image not found, cannot process.');
    return;
  }

  const imageSize = fs.statSync(imagePath).size;
  if (imageSize === 0) {
    console.error('Downloaded image is empty!');
    return;
  }

  const weatherInfo = await getWeather();
  const aqiresult = await getAQI(city);
  const dateText = getDateTimeString();
  const { daily, sign } = await getHoroscopes();

  const finalText = `     ${dateText}, ${weatherInfo.temperature} (Feels Like ${weatherInfo.feelsLike}), ${city}
Wind ${weatherInfo.windSpeed}, Humidity ${weatherInfo.humidity}, Rainfall Chances ${weatherInfo.rainChance}
Current Condtions: ${weatherInfo.sky}, Today's Forecast: ${weatherInfo.forecastText}
Air Quality Index (AQI): ${aqiresult.aqi} (${aqiresult.status})`;

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 35px FancyFont';
  context.fillStyle = 'white';
  context.shadowColor = 'rgba(0,0,0,0.5)';
  context.shadowBlur = 8;

  const lines = finalText.split('\n');
  const lineHeight = 50;
  const startY = height - 150 - ((lines.length - 1) * lineHeight) / 2;

  for (const [index, line] of lines.entries()) {
    context.fillText(line.trim(), width / 2, startY + index * lineHeight);
  }

  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = '30px FancyFont';
  context.fillStyle = 'white';
  context.shadowColor = 'rgba(0,0,0,0.7)';
  context.shadowBlur = 6;

  const safePadding = 300;
  const x = safePadding;
  let y = 30;

  if (SHOW_HOROSCOPE === 'True') {
    const horoscopeLine = `Today's Horoscope for ${sign}: ${daily}`;
    const wrappedLines = wrapText(horoscopeLine, width - safePadding * 2);
    for (const line of wrappedLines) {
      context.fillText(line, x, y);
      y += 35;
    }
  }

  function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line + word + ' ';
      if (context.measureText(test).width > maxWidth) {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line = test;
      }
    }

    lines.push(line.trim());
    return lines;
  }

  const overlayBuffer = canvas.toBuffer();

  await sharp(imagePath)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 100 })
    .toFile(outputImage);

  //console.log('Image generated successfully!');
}

async function startAutoDP(sock) {
  if (globalThis.autodpRunning) return;

  globalThis.autodpRunning = true;

  await ensureFontDownloaded();
  registerFont(fontPath, { family: 'FancyFont' });

  const now = new Date().toLocaleString('en-US', { timeZone: TIME_ZONE });
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0);
  nextMinute.setMilliseconds(0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  const delay = new Date(nextMinute) - new Date(now);

  const intervalMs = parseInt(process.env.AUTO_DP_INTERVAL_MS, 10) || 60000;

  setTimeout(() => {
    globalThis.autodpInterval = setInterval(async () => {
      try {
        await generateImage();
        const buffer = fs.readFileSync(outputImage);
        await sock.updateProfilePicture('status@broadcast', buffer); // Can be customized
        console.log('DP updated');
      } catch (error) {
        console.error('DP update failed:', error.message);
      }
    }, intervalMs);

    // Run immediately at first aligned minute
    (async () => {
      try {
        await generateImage();
        const buffer = fs.readFileSync(outputImage);
        await sock.updateProfilePicture('status@broadcast', buffer);
        console.log('DP updated');
      } catch (error) {
        console.error('DP update failed:', error.message);
      }
    })();
  }, delay);
}

export default {
  name: '.autodp',
  description: 'Start updating WhatsApp Profile Picture with clock, temperature, and horoscope',
  usage: 'Type .autodp in any chat to start auto-updating your DP every X seconds',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const intervalMs = parseInt(process.env.AUTO_DP_INTERVAL_MS, 10) || 60000;

    if (globalThis.autodpRunning) {
      if (!msg.fromStartup) {
        await sock.sendMessage(jid, { text: 'AutoDP is already running!' }, { quoted: msg });
      }
      return;
    }

    if (!msg.fromStartup) {
      await sock.sendMessage(jid, { text: `AutoDP started.\nUpdating every ${intervalMs / 1000}s` }, { quoted: msg });
    }

    await startAutoDP(sock);
  },

  startAutoDP
};
