const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

// Parse CSV
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
  }
  
  return rows;
}

// Load all data
console.log('📡 Loading iptv-org database...\n');

const channelsCSV = fs.readFileSync(path.join(DATA_DIR, 'channels.csv'), 'utf8');
const feedsCSV = fs.readFileSync(path.join(DATA_DIR, 'feeds.csv'), 'utf8');
const categoriesCSV = fs.readFileSync(path.join(DATA_DIR, 'categories.csv'), 'utf8');
const countriesCSV = fs.readFileSync(path.join(DATA_DIR, 'countries.csv'), 'utf8');
const languagesCSV = fs.readFileSync(path.join(DATA_DIR, 'languages.csv'), 'utf8');

console.log('Parsing CSV files...');
const channels = parseCSV(channelsCSV);
const feeds = parseCSV(feedsCSV);
const categories = parseCSV(categoriesCSV);
const countries = parseCSV(countriesCSV);
const languages = parseCSV(languagesCSV);

console.log(`✅ Channels: ${channels.length}`);
console.log(`✅ Feeds: ${feeds.length}`);
console.log(`✅ Categories: ${categories.length}`);
console.log(`✅ Countries: ${countries.length}`);
console.log(`✅ Languages: ${languages.length}`);

// Build lookup maps
console.log('\n🔨 Building lookup maps...');

const feedsByChannel = new Map();
feeds.forEach(feed => {
  const ch = feed.channel;
  if (!feedsByChannel.has(ch)) {
    feedsByChannel.set(ch, []);
  }
  feedsByChannel.get(ch).push(feed);
});

const categoryMap = new Map();
categories.forEach(cat => {
  categoryMap.set(cat.id, cat.name);
});

const countryMap = new Map();
const countryFlagMap = new Map();
countries.forEach(c => {
  countryMap.set(c.code, c.name);
  countryFlagMap.set(c.code, c.flag || '🌍');
});

const languageMap = new Map();
languages.forEach(lang => {
  languageMap.set(lang.code, lang.name);
});

console.log('✅ Lookup maps built');

// Merge channels with feeds
console.log('\n💾 Merging channels with feeds...');

const enrichedChannels = channels.map(ch => {
  const chFeeds = feedsByChannel.get(ch.id) || [];
  
  // Get primary feed (main stream)
  const primaryFeed = chFeeds.find(f => f.is_main === 'TRUE') || chFeeds[0];
  
  // Build stream URL from feed
  let streamUrl = '';
  if (primaryFeed) {
    // Construct stream URL based on format
    const feedId = primaryFeed.id;
    streamUrl = `https://iptv-org.github.io/iptv/streams/${ch.id}-${feedId}.m3u8`;
  }
  
  // Parse categories
  const cats = ch.categories ? ch.categories.split(';').map(c => c.trim()).filter(Boolean) : ['General'];
  const primaryCategory = cats[0] || 'General';
  
  // Get country flag
  const countryFlag = countryFlagMap.get(ch.country) || '🌍';
  
  // Get language names
  const langNames = ch.languages ? ch.languages.split(';').map(l => languageMap.get(l.trim()) || l.trim()).filter(Boolean) : [];
  const primaryLanguage = langNames[0] || 'Unknown';
  
  return {
    id: ch.id,
    name: ch.name,
    logo: '',
    group: primaryCategory,
    country: ch.country || 'XX',
    countryFlag: countryFlag,
    language: primaryLanguage,
    languages: langNames,
    url: streamUrl,
    active: true,
    is_nsfw: ch.is_nsfw === 'TRUE',
    launched: ch.launched,
    closed: ch.closed,
    website: ch.website,
    feeds: chFeeds.map(f => ({
      id: f.id,
      name: f.name,
      broadcast_area: f.broadcast_area,
      timezones: f.timezones,
      languages: f.languages,
      format: f.format
    }))
  };
});

// Filter out channels without streams
const channelsWithStreams = enrichedChannels.filter(ch => ch.url || ch.feeds.length > 0);

console.log(`✅ Total channels: ${enrichedChannels.length}`);
console.log(`✅ Channels with streams: ${channelsWithStreams.length}`);

// Save to JSON
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channelsWithStreams, null, 2));
console.log(`\n💾 Saved to ${CHANNELS_FILE}`);

// Generate stats
console.log('\n📊 Stats:');

const categoryCounts = {};
channelsWithStreams.forEach(ch => {
  categoryCounts[ch.group] = (categoryCounts[ch.group] || 0) + 1;
});
const topCategories = Object.entries(categoryCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
console.log('\n📁 Top Categories:');
topCategories.forEach(([cat, count]) => {
  console.log(`   ${cat}: ${count}`);
});

const countryCounts = {};
channelsWithStreams.forEach(ch => {
  countryCounts[ch.country] = (countryCounts[ch.country] || 0) + 1;
});
const topCountries = Object.entries(countryCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
console.log('\n🌍 Top Countries:');
topCountries.forEach(([code, count]) => {
  const flag = countryFlagMap.get(code) || '🌍';
  const name = countryMap.get(code) || code;
  console.log(`   ${flag} ${name} (${code}): ${count}`);
});

const languageCounts = {};
channelsWithStreams.forEach(ch => {
  if (ch.language && ch.language !== 'Unknown') {
    languageCounts[ch.language] = (languageCounts[ch.language] || 0) + 1;
  }
});
const topLanguages = Object.entries(languageCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
console.log('\n🗣️ Top Languages:');
topLanguages.forEach(([lang, count]) => {
  console.log(`   ${lang}: ${count}`);
});

// Save metadata
const metadata = {
  totalChannels: enrichedChannels.length,
  channelsWithStreams: channelsWithStreams.length,
  categories: topCategories.map(([name, count]) => name),
  countries: topCountries.map(([code, count]) => code),
  languages: topLanguages.map(([name, count]) => name),
  categoryCounts: Object.fromEntries(topCategories),
  countryCounts: Object.fromEntries(topCountries),
  languageCounts: Object.fromEntries(topLanguages),
  lastSync: new Date().toISOString()
};

fs.writeFileSync(path.join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log('\n✅ Metadata saved');

console.log('\n🎉 Database sync complete!');
