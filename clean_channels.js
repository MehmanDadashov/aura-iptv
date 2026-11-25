const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'channels_clean.json');

console.log('🧹 Cleaning and syncing channels with iptv-org standard...\n');

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
console.log(`📂 Loaded ${channels.length} channels`);

// Official categories from PLAYLISTS.md
const OFFICIAL_CATEGORIES = new Set([
  'animation', 'auto', 'business', 'classic', 'comedy', 'cooking',
  'culture', 'documentary', 'education', 'entertainment', 'family',
  'general', 'interactive', 'kids', 'legislative', 'lifestyle',
  'movies', 'music', 'news', 'outdoor', 'public', 'relax',
  'religious', 'science', 'series', 'shop', 'sports', 'travel',
  'weather', 'xxx', 'undefined'
]);

// 1. Remove NSFW channels (as of Jan 30, 2024, iptv-org stopped distributing NSFW)
let beforeNsfw = channels.length;
let cleaned = channels.filter(ch => !ch.is_nsfw);
let removedNsfw = beforeNsfw - cleaned.length;
console.log(`🚫 Removed ${removedNsfw} NSFW channels`);

// 2. Remove closed channels
let beforeClosed = cleaned.length;
cleaned = cleaned.filter(ch => !ch.closed);
let removedClosed = beforeClosed - cleaned.length;
console.log(`🔴 Removed ${removedClosed} closed channels`);

// 3. Remove channels without valid stream URL
let beforeStreams = cleaned.length;
cleaned = cleaned.filter(ch => ch.url && ch.url.startsWith('http'));
let removedNoStream = beforeStreams - cleaned.length;
console.log(`⚠️  Removed ${removedNoStream} channels without valid streams`);

// 4. Normalize categories to official list
let normalized = 0;
cleaned = cleaned.map(ch => {
  const group = (ch.group || 'general').toLowerCase().trim();
  if (OFFICIAL_CATEGORIES.has(group)) {
    if (ch.group !== group) normalized++;
    return { ...ch, group };
  }
  // Map unknown categories to 'undefined'
  normalized++;
  return { ...ch, group: 'undefined' };
});
console.log(`📁 Normalized ${normalized} categories to official list`);

// 5. Remove duplicates by id
let beforeDedup = cleaned.length;
const seen = new Set();
cleaned = cleaned.filter(ch => {
  if (seen.has(ch.id)) return false;
  seen.add(ch.id);
  return true;
});
let removedDupes = beforeDedup - cleaned.length;
console.log(`🔁 Removed ${removedDupes} duplicate channels`);

// 6. Sort by country then category then name
cleaned.sort((a, b) => {
  const countryCompare = (a.country || 'XX').localeCompare(b.country || 'XX');
  if (countryCompare !== 0) return countryCompare;
  const categoryCompare = (a.group || 'general').localeCompare(b.group || 'general');
  if (categoryCompare !== 0) return categoryCompare;
  return (a.name || '').localeCompare(b.name || '');
});

console.log(`\n✅ Final count: ${cleaned.length} channels`);

// 7. Save cleaned data
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned, null, 2));
fs.copyFileSync(OUTPUT_FILE, CHANNELS_FILE);
console.log(`💾 Saved to ${CHANNELS_FILE}`);

// 8. Generate stats
const stats = {
  total: cleaned.length,
  categories: {},
  countries: {},
  languages: {},
  removed: {
    nsfw: removedNsfw,
    closed: removedClosed,
    noStream: removedNoStream,
    duplicates: removedDupes
  }
};

cleaned.forEach(ch => {
  stats.categories[ch.group] = (stats.categories[ch.group] || 0) + 1;
  stats.countries[ch.country] = (stats.countries[ch.country] || 0) + 1;
  if (ch.language && ch.language !== 'Unknown') {
    stats.languages[ch.language] = (stats.languages[ch.language] || 0) + 1;
  }
});

fs.writeFileSync(path.join(DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2));
console.log(`📊 Stats saved to ${path.join(DATA_DIR, 'stats.json')}`);

// 9. Print summary
console.log('\n📊 Final Stats:');
console.log(`   Total channels: ${stats.total}`);
console.log(`   Categories: ${Object.keys(stats.categories).length}`);
console.log(`   Countries: ${Object.keys(stats.countries).length}`);
console.log(`   Languages: ${Object.keys(stats.languages).length}`);

console.log('\n📁 Categories:');
Object.entries(stats.categories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => console.log(`   ${cat}: ${count}`));

console.log('\n🌍 Top Countries:');
Object.entries(stats.countries)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([code, count]) => console.log(`   ${code}: ${count}`));

console.log('\n🗑️  Removed:');
console.log(`   NSFW: ${stats.removed.nsfw}`);
console.log(`   Closed: ${stats.removed.closed}`);
console.log(`   No stream: ${stats.removed.noStream}`);
console.log(`   Duplicates: ${stats.removed.duplicates}`);

console.log('\n🎉 Sync complete!');
