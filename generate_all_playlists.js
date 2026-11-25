const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const OUTPUT_DIR = path.join(__dirname, 'playlists');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
console.log(`📺 Loaded ${channels.length} channels\n`);

// ===== CATEGORY PLAYLISTS =====
console.log('📁 Generating category playlists...');
const byCategory = {};
channels.forEach(ch => {
  const cat = (ch.group || 'general').toLowerCase();
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(ch);
});

Object.values(byCategory).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);

sortedCategories.forEach(([cat, catChannels]) => {
  const filename = path.join(OUTPUT_DIR, `${cat}.m3u`);
  let content = '#EXTM3U\n';
  catChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const country = ch.countryFlag ? `${ch.countryFlag} ${ch.country}` : ch.country || '';
    content += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name} (${country})\n`;
    content += `${ch.url}\n`;
  });
  fs.writeFileSync(filename, content);
});
console.log(`✅ Generated ${sortedCategories.length} category playlists`);

// ===== LANGUAGE PLAYLISTS =====
console.log('\n🗣️ Generating language playlists...');
const byLanguage = {};
channels.forEach(ch => {
  const lang = (ch.language || 'undefined').toLowerCase();
  if (!byLanguage[lang]) byLanguage[lang] = [];
  byLanguage[lang].push(ch);
});

Object.values(byLanguage).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedLanguages = Object.entries(byLanguage).sort((a, b) => b[1].length - a[1].length);

sortedLanguages.forEach(([lang, langChannels]) => {
  const safeName = lang.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = path.join(OUTPUT_DIR, `${safeName}.m3u`);
  let content = '#EXTM3U\n';
  langChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const country = ch.countryFlag ? `${ch.countryFlag} ${ch.country}` : ch.country || '';
    content += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name} (${country})\n`;
    content += `${ch.url}\n`;
  });
  fs.writeFileSync(filename, content);
});
console.log(`✅ Generated ${sortedLanguages.length} language playlists`);

// ===== COUNTRY PLAYLISTS =====
console.log('\n🌍 Generating country playlists...');
const byCountry = {};
channels.forEach(ch => {
  const country = ch.country || 'general';
  if (!byCountry[country]) byCountry[country] = [];
  byCountry[country].push(ch);
});

Object.values(byCountry).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
const sortedCountries = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length);

sortedCountries.forEach(([country, countryChannels]) => {
  const safeName = country.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = path.join(OUTPUT_DIR, `${safeName}.m3u`);
  let content = '#EXTM3U\n';
  countryChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    content += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name}\n`;
    content += `${ch.url}\n`;
  });
  fs.writeFileSync(filename, content);
});
console.log(`✅ Generated ${sortedCountries.length} country playlists`);

// ===== COMBINED INDEX FILES =====
console.log('\n📄 Generating combined index files...');

// index.category.m3u
let categoryIndex = '#EXTM3U\n';
sortedCategories.forEach(([cat, catChannels]) => {
  catChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    categoryIndex += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name}\n`;
    categoryIndex += `${ch.url}\n`;
  });
});
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.category.m3u'), categoryIndex);

// index.language.m3u
let languageIndex = '#EXTM3U\n';
sortedLanguages.forEach(([lang, langChannels]) => {
  langChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    languageIndex += `#EXTINF:-1 ${logo} group-title="${ch.group}",${ch.name}\n`;
    languageIndex += `${ch.url}\n`;
  });
});
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.language.m3u'), languageIndex);

// index.country.m3u
let countryIndex = '#EXTM3U\n';
sortedCountries.forEach(([country, countryChannels]) => {
  countryChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    countryIndex += `#EXTINF:-1 ${logo} group-title="${country}",${ch.name}\n`;
    countryIndex += `${ch.url}\n`;
  });
});
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.country.m3u'), countryIndex);

console.log('✅ Generated index.category.m3u, index.language.m3u, index.country.m3u');

// ===== SUMMARY =====
const summary = {
  totalChannels: channels.length,
  categories: sortedCategories.length,
  languages: sortedLanguages.length,
  countries: sortedCountries.length,
  topCategories: sortedCategories.slice(0, 10).map(([name, chs]) => ({ name, count: chs.length })),
  topLanguages: sortedLanguages.slice(0, 10).map(([name, chs]) => ({ name, count: chs.length })),
  topCountries: sortedCountries.slice(0, 10).map(([name, chs]) => ({ name, count: chs.length })),
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('\n📊 Summary:');
console.log(`   Total channels: ${summary.totalChannels}`);
console.log(`   Categories: ${summary.categories}`);
console.log(`   Languages: ${summary.languages}`);
console.log(`   Countries: ${summary.countries}`);
console.log('\n📁 Top Categories:');
summary.topCategories.forEach(c => console.log(`   ${c.name}: ${c.count}`));
console.log('\n🗣️ Top Languages:');
summary.topLanguages.forEach(c => console.log(`   ${c.name}: ${c.count}`));
console.log('\n🌍 Top Countries:');
summary.topCountries.forEach(c => console.log(`   ${c.name}: ${c.count}`));

console.log('\n🎉 All playlists generated successfully!');
