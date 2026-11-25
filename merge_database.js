const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const M3U_CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const DB_CHANNELS_FILE = path.join(DATA_DIR, 'channels_db.json');
const FINAL_CHANNELS_FILE = path.join(DATA_DIR, 'channels_final.json');

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

async function mergeData() {
  console.log('🚀 Merging M3U channels with database metadata...\n');
  
  // 1. Load M3U channels (has stream URLs)
  const m3uChannels = JSON.parse(fs.readFileSync(M3U_CHANNELS_FILE, 'utf8'));
  console.log(`📂 Loaded ${m3uChannels.length} M3U channels with streams`);
  
  // 2. Load and parse database CSVs
  console.log('\n📡 Loading database CSVs...');
  const channelsCSV = fs.readFileSync(path.join(DATA_DIR, 'channels.csv'), 'utf8');
  const feedsCSV = fs.readFileSync(path.join(DATA_DIR, 'feeds.csv'), 'utf8');
  const categoriesCSV = fs.readFileSync(path.join(DATA_DIR, 'categories.csv'), 'utf8');
  const countriesCSV = fs.readFileSync(path.join(DATA_DIR, 'countries.csv'), 'utf8');
  const languagesCSV = fs.readFileSync(path.join(DATA_DIR, 'languages.csv'), 'utf8');
  
  const dbChannels = parseCSV(channelsCSV);
  const feeds = parseCSV(feedsCSV);
  const categories = parseCSV(categoriesCSV);
  const countries = parseCSV(countriesCSV);
  const languages = parseCSV(languagesCSV);
  
  console.log(`✅ DB Channels: ${dbChannels.length}`);
  console.log(`✅ Feeds: ${feeds.length}`);
  console.log(`✅ Categories: ${categories.length}`);
  console.log(`✅ Countries: ${countries.length}`);
  console.log(`✅ Languages: ${languages.length}`);
  
  // 3. Build lookup maps
  console.log('\n🔨 Building lookup maps...');
  
  const feedsByChannel = new Map();
  feeds.forEach(feed => {
    const ch = feed.channel;
    if (!feedsByChannel.has(ch)) {
      feedsByChannel.set(ch, []);
    }
    feedsByChannel.get(ch).push(feed);
  });
  
  const categoryNameMap = new Map();
  categories.forEach(cat => {
    categoryNameMap.set(cat.id, cat.name);
  });
  
  const countryNameMap = new Map();
  const countryFlagMap = new Map();
  countries.forEach(c => {
    countryNameMap.set(c.code, c.name);
    countryFlagMap.set(c.code, c.flag || '🌍');
  });
  
  const languageNameMap = new Map();
  languages.forEach(lang => {
    languageNameMap.set(lang.code, lang.name);
  });
  
  // Build DB channel map by name (case-insensitive)
  const dbChannelMap = new Map();
  dbChannels.forEach(ch => {
    const key = ch.name.toLowerCase().trim();
    dbChannelMap.set(key, ch);
  });
  
  console.log('✅ Lookup maps built');
  
  // 4. Merge M3U channels with DB metadata
  console.log('\n💾 Merging data...');
  
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  const mergedChannels = m3uChannels.map(ch => {
    // Try to find matching DB channel by name
    const dbKey = ch.name.toLowerCase().trim();
    const dbChannel = dbChannelMap.get(dbKey);
    
    if (dbChannel) {
      matchedCount++;
      
      // Parse categories from DB
      const cats = dbChannel.categories ? dbChannel.categories.split(';').map(c => c.trim()).filter(Boolean) : ['General'];
      const primaryCategory = (cats[0] || 'General').toLowerCase();
      
      // Get country info from DB
      const countryCode = dbChannel.country || ch.country || 'XX';
      const countryFlag = countryFlagMap.get(countryCode) || ch.countryFlag || '🌍';
      const countryName = countryNameMap.get(countryCode) || '';
      
      // Get language from feeds
      const chFeeds = feedsByChannel.get(dbChannel.id) || [];
      const primaryFeed = chFeeds.find(f => f.is_main === 'TRUE') || chFeeds[0];
      const feedLangs = primaryFeed ? (primaryFeed.languages || '').split(';').map(l => l.trim()).filter(Boolean) : [];
      const primaryLangCode = feedLangs[0] || '';
      const primaryLanguage = languageNameMap.get(primaryLangCode) || ch.language || 'Unknown';
      
      return {
        ...ch,
        group: primaryCategory,
        country: countryCode,
        countryFlag: countryFlag,
        countryName: countryName,
        language: primaryLanguage,
        languageCode: primaryLangCode,
        is_nsfw: dbChannel.is_nsfw === 'TRUE',
        launched: dbChannel.launched,
        closed: dbChannel.closed,
        website: dbChannel.website,
        network: dbChannel.network,
        owners: dbChannel.owners
      };
    } else {
      unmatchedCount++;
      return ch;
    }
  });
  
  console.log(`✅ Matched: ${matchedCount} channels`);
  console.log(`⚠️  Unmatched: ${unmatchedCount} channels (kept original data)`);
  
  // 5. Normalize categories
  const categoryCounts = {};
  mergedChannels.forEach(ch => {
    const cat = ch.group.toLowerCase();
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  
  // 6. Save final channels
  fs.writeFileSync(FINAL_CHANNELS_FILE, JSON.stringify(mergedChannels, null, 2));
  console.log(`\n💾 Saved ${mergedChannels.length} channels to ${FINAL_CHANNELS_FILE}`);
  
  // 7. Generate final stats
  console.log('\n📊 Final Stats:');
  console.log(`   Total channels: ${mergedChannels.length}`);
  console.log(`   Channels with streams: ${mergedChannels.filter(ch => ch.url).length}`);
  console.log(`   Categories: ${Object.keys(categoryCounts).length}`);
  console.log(`   Countries: ${new Set(mergedChannels.map(ch => ch.country)).size}`);
  
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.log('\n📁 Top Categories:');
  topCategories.forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
  
  // 8. Copy to main channels.json
  fs.copyFileSync(FINAL_CHANNELS_FILE, M3U_CHANNELS_FILE);
  console.log(`\n✅ Updated main channels.json`);
  
  console.log('\n🎉 Merge complete!');
}

mergeData().catch(e => console.error('Fatal error:', e));
