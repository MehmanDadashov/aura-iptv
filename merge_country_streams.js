const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const COUNTRY_M3U = path.join(DATA_DIR, 'index.country.m3u');
const OUTPUT_DIR = path.join(__dirname, 'playlists');

console.log('🔄 Merging country M3U with enriched database...\n');

// Load enriched channels from database merge
const enrichedChannels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
console.log(`📂 Loaded ${enrichedChannels.length} enriched channels`);

// Parse country M3U for real stream URLs
const m3u = fs.readFileSync(COUNTRY_M3U, 'utf8');
const lines = m3u.split('\n');
const m3uChannels = [];
let currentEntry = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  if (line.startsWith('#EXTINF:')) {
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
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
    m3uChannels.push(currentEntry);
    currentEntry = null;
  }
}

console.log(`📡 Parsed ${m3uChannels.length} channels from country M3U`);

// Build lookup by name
const m3uByName = new Map();
m3uChannels.forEach(ch => {
  const key = ch.name.toLowerCase().trim();
  if (!m3uByName.has(key)) {
    m3uByName.set(key, []);
  }
  m3uByName.get(key).push(ch);
});

// Merge: prefer real stream URLs from M3U, keep metadata from database
let matched = 0;
let updatedUrls = 0;

const merged = enrichedChannels.map(ch => {
  const key = ch.name.toLowerCase().trim();
  const m3uMatches = m3uByName.get(key);
  
  if (m3uMatches && m3uMatches.length > 0) {
    matched++;
    // Find best match (prefer one with same country if available)
    const bestMatch = m3uMatches.find(m => m.country === ch.country) || m3uMatches[0];
    
    // If current URL is 404 placeholder, replace with real URL
    if (!ch.url || ch.url.includes('github.io/iptv/streams') || ch.url.includes('Not+Found')) {
      updatedUrls++;
      return {
        ...ch,
        url: bestMatch.url,
        logo: bestMatch.logo || ch.logo,
        group: bestMatch.group || ch.group,
        country: bestMatch.country || ch.country
      };
    }
    
    return ch;
  }
  
  return ch;
});

console.log(`✅ Matched ${matched} channels with real streams`);
console.log(`✅ Updated ${updatedUrls} channels with real stream URLs`);

// Save merged data
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(merged, null, 2));
console.log(`💾 Saved ${merged.length} channels to ${CHANNELS_FILE}`);

// Regenerate country playlists from merged data
console.log('\n📁 Regenerating country playlists...');
const byCountry = {};
merged.forEach(ch => {
  const country = ch.country || 'General';
  if (!byCountry[country]) byCountry[country] = [];
  byCountry[country].push(ch);
});

const sortedCountries = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length);
sortedCountries.forEach(([country, countryChannels]) => {
  const safeName = country.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = path.join(OUTPUT_DIR, `${safeName}.m3u`);
  
  let content = '#EXTM3U\n';
  countryChannels.sort((a, b) => a.name.localeCompare(b.name)).forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    content += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name}\n`;
    content += `${ch.url}\n`;
  });
  
  fs.writeFileSync(filename, content);
});

console.log(`✅ Generated ${sortedCountries.length} country playlists`);

// Stats
const stats = {
  total: merged.length,
  countries: sortedCountries.length,
  withRealStreams: merged.filter(ch => ch.url && !ch.url.includes('github.io/iptv/streams')).length,
  topCountries: sortedCountries.slice(0, 10).map(([name, chs]) => ({ name, count: chs.length }))
};

fs.writeFileSync(path.join(DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2));

console.log('\n📊 Final Stats:');
console.log(`   Total channels: ${stats.total}`);
console.log(`   Countries: ${stats.countries}`);
console.log(`   With real streams: ${stats.withRealStreams}`);
console.log('\n📁 Top Countries:');
stats.topCountries.forEach(c => console.log(`   ${c.name}: ${c.count}`));

console.log('\n🎉 Merge complete!');
