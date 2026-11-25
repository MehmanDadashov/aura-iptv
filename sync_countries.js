const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const M3U_FILE = path.join(DATA_DIR, 'index.country.m3u');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const OUTPUT_DIR = path.join(__dirname, 'playlists');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log('📡 Parsing index.country.m3u...\n');

const m3u = fs.readFileSync(M3U_FILE, 'utf8');
const lines = m3u.split('\n');
const channels = [];
let currentEntry = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  if (line.startsWith('#EXTINF:')) {
    // Parse attributes
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
    
    // Extract channel name (after last comma)
    const commaIndex = line.lastIndexOf(',');
    const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : '';
    
    currentEntry = {
      name,
      logo: logoMatch ? logoMatch[1] : '',
      group: groupMatch ? groupMatch[1] : 'General',
      country: groupMatch ? groupMatch[1] : 'General',
      tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
      url: ''
    };
  } else if (line && !line.startsWith('#') && currentEntry) {
    currentEntry.url = line;
    channels.push(currentEntry);
    currentEntry = null;
  }
}

console.log(`✅ Parsed ${channels.length} channels from index.country.m3u`);

// Group by country
const byCountry = {};
channels.forEach(ch => {
  const country = ch.country || 'General';
  if (!byCountry[country]) byCountry[country] = [];
  byCountry[country].push(ch);
});

// Sort countries by channel count
const sortedCountries = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length);
console.log(`✅ Found ${sortedCountries.length} countries`);

// Generate M3U per country
sortedCountries.forEach(([country, countryChannels]) => {
  const safeName = country.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = path.join(OUTPUT_DIR, `${safeName}.m3u`);
  
  let content = '#EXTM3U\n';
  countryChannels.sort((a, b) => a.name.localeCompare(b.name)).forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const group = ch.group || country;
    content += `#EXTINF:-1 ${logo} tvg-id="${ch.tvgId}" group-title="${group}",${ch.name}\n`;
    content += `${ch.url}\n`;
  });
  
  fs.writeFileSync(filename, content);
});

console.log(`✅ Generated ${sortedCountries.length} country playlists`);

// Also save as JSON for API
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
console.log(`💾 Saved ${channels.length} channels to ${CHANNELS_FILE}`);

// Stats
console.log('\n📊 Top Countries:');
sortedCountries.slice(0, 15).forEach(([country, count]) => {
  console.log(`   ${country}: ${count.length} channels`);
});

console.log('\n🎉 Country sync complete!');
