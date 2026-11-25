const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const CATEGORY_M3U = path.join(DATA_DIR, 'index.category.m3u');
const LANGUAGE_M3U = path.join(DATA_DIR, 'index.language.m3u');
const COUNTRY_M3U = path.join(DATA_DIR, 'index.country.m3u');
const OUTPUT_DIR = path.join(__dirname, 'playlists');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Parse M3U file
function parseM3U(text) {
  const lines = text.split('\n');
  const channels = [];
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
        tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
        url: ''
      };
    } else if (line && !line.startsWith('#') && currentEntry) {
      currentEntry.url = line;
      channels.push(currentEntry);
      currentEntry = null;
    }
  }
  return channels;
}

console.log('📡 Parsing official iptv-org playlists...\n');

const categoryChannels = parseM3U(fs.readFileSync(CATEGORY_M3U, 'utf8'));
const languageChannels = parseM3U(fs.readFileSync(LANGUAGE_M3U, 'utf8'));
const countryChannels = parseM3U(fs.readFileSync(COUNTRY_M3U, 'utf8'));

console.log(`📂 Category M3U: ${categoryChannels.length} channels`);
console.log(`📂 Language M3U: ${languageChannels.length} channels`);
console.log(`📂 Country M3U: ${countryChannels.length} channels`);

// Build lookup maps
const categoryMap = new Map();
categoryChannels.forEach(ch => {
  const key = ch.name.toLowerCase().trim();
  if (!categoryMap.has(key)) categoryMap.set(key, []);
  categoryMap.get(key).push(ch);
});

const languageMap = new Map();
languageChannels.forEach(ch => {
  const key = ch.name.toLowerCase().trim();
  if (!languageMap.has(key)) languageMap.set(key, []);
  languageMap.get(key).push(ch);
});

const countryMap = new Map();
countryChannels.forEach(ch => {
  const key = ch.name.toLowerCase().trim();
  if (!countryMap.has(key)) countryMap.set(key, []);
  countryMap.get(key).push(ch);
});

console.log('✅ Lookup maps built');

// Merge all data
console.log('\n💾 Merging data...');
const mergedChannels = [];
const seen = new Set();

// Start with country channels (has real stream URLs)
countryChannels.forEach(ch => {
  const key = ch.name.toLowerCase().trim();
  if (seen.has(key)) return;
  seen.add(key);

  const categoryMatch = categoryMap.get(key)?.[0];
  const languageMatch = languageMap.get(key)?.[0];

  mergedChannels.push({
    id: ch.tvgId || categoryMatch?.tvgId || languageMatch?.tvgId || ch.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: ch.name,
    logo: ch.logo || categoryMatch?.logo || languageMatch?.logo || '',
    group: categoryMatch?.group || ch.group || 'General',
    country: ch.group || 'General',
    language: languageMatch?.group || 'Undefined',
    url: ch.url,
    tvgId: ch.tvgId || categoryMatch?.tvgId || languageMatch?.tvgId || ''
  });
});

// Add any channels from category/language that weren't in country
[categoryChannels, languageChannels].forEach(source => {
  source.forEach(ch => {
    const key = ch.name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);

    const countryMatch = countryMap.get(key)?.[0];
    const langMatch = languageMap.get(key)?.[0];
    const catMatch = categoryMap.get(key)?.[0];

    mergedChannels.push({
      id: ch.tvgId || countryMatch?.tvgId || langMatch?.tvgId || catMatch?.tvgId || ch.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: ch.name,
      logo: ch.logo || '',
      group: ch.group || 'General',
      country: countryMatch?.group || 'International',
      language: langMatch?.group || 'Undefined',
      url: countryMatch?.url || '',
      tvgId: ch.tvgId || ''
    });
  });
});

console.log(`✅ Merged ${mergedChannels.length} unique channels`);

// Save merged data
fs.writeFileSync(CHANNELS_FILE, JSON.stringify(mergedChannels, null, 2));
console.log(`💾 Saved to ${CHANNELS_FILE}`);

// ===== GENERATE ALL PLAYLISTS =====
console.log('\n📁 Generating playlists...');

// Helper to generate M3U files
function generatePlaylist(channels, filename) {
  let content = '#EXTM3U\n';
  channels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const group = ch.group || 'General';
    content += `#EXTINF:-1 ${logo} group-title="${group}",${ch.name}\n`;
    content += `${ch.url}\n`;
  });
  fs.writeFileSync(filename, content);
}

// Category playlists
const byCategory = {};
mergedChannels.forEach(ch => {
  const cat = (ch.group || 'general').toLowerCase();
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(ch);
});
Object.values(byCategory).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
sortedCategories.forEach(([cat, catChannels]) => {
  generatePlaylist(catChannels, path.join(OUTPUT_DIR, `${cat}.m3u`));
});
console.log(`✅ ${sortedCategories.length} category playlists`);

// Language playlists
const byLanguage = {};
mergedChannels.forEach(ch => {
  const lang = (ch.language || 'undefined').toLowerCase();
  if (!byLanguage[lang]) byLanguage[lang] = [];
  byLanguage[lang].push(ch);
});
Object.values(byLanguage).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedLanguages = Object.entries(byLanguage).sort((a, b) => b[1].length - a[1].length);
sortedLanguages.forEach(([lang, langChannels]) => {
  const safeName = lang.replace(/[^a-zA-Z0-9_-]/g, '_');
  generatePlaylist(langChannels, path.join(OUTPUT_DIR, `${safeName}.m3u`));
});
console.log(`✅ ${sortedLanguages.length} language playlists`);

// Country playlists
const byCountry = {};
mergedChannels.forEach(ch => {
  const country = ch.country || 'general';
  if (!byCountry[country]) byCountry[country] = [];
  byCountry[country].push(ch);
});
Object.values(byCountry).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedCountries = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length);
sortedCountries.forEach(([country, countryChannels]) => {
  const safeName = country.replace(/[^a-zA-Z0-9_-]/g, '_');
  generatePlaylist(countryChannels, path.join(OUTPUT_DIR, `${safeName}.m3u`));
});
console.log(`✅ ${sortedCountries.length} country playlists`);

// Combined index files
function generateIndex(channels, filename, groupField) {
  let content = '#EXTM3U\n';
  channels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const group = groupField === 'country' ? (ch.country || 'General') : (ch.group || 'General');
    content += `#EXTINF:-1 ${logo} group-title="${group}",${ch.name}\n`;
    content += `${ch.url}\n`;
  });
  fs.writeFileSync(filename, content);
}

generateIndex(mergedChannels, path.join(OUTPUT_DIR, 'index.category.m3u'), 'category');
generateIndex(mergedChannels, path.join(OUTPUT_DIR, 'index.language.m3u'), 'language');
generateIndex(mergedChannels, path.join(OUTPUT_DIR, 'index.country.m3u'), 'country');
console.log('✅ Combined index files generated');

// Stats
const stats = {
  total: mergedChannels.length,
  categories: sortedCategories.length,
  languages: sortedLanguages.length,
  countries: sortedCountries.length,
  topCategories: sortedCategories.slice(0, 15).map(([name, chs]) => ({ name, count: chs.length })),
  topLanguages: sortedLanguages.slice(0, 15).map(([name, chs]) => ({ name, count: chs.length })),
  topCountries: sortedCountries.slice(0, 15).map(([name, chs]) => ({ name, count: chs.length }))
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(stats, null, 2));

console.log('\n📊 Final Stats:');
console.log(`   Total channels: ${stats.total}`);
console.log(`   Categories: ${stats.categories}`);
console.log(`   Languages: ${stats.languages}`);
console.log(`   Countries: ${stats.countries}`);
console.log('\n📁 Top Categories:');
stats.topCategories.forEach(c => console.log(`   ${c.name}: ${c.count}`));
console.log('\n🗣️ Top Languages:');
stats.topLanguages.forEach(c => console.log(`   ${c.name}: ${c.count}`));
console.log('\n🌍 Top Countries:');
stats.topCountries.forEach(c => console.log(`   ${c.name}: ${c.count}`));

console.log('\n🎉 Sync complete!');
