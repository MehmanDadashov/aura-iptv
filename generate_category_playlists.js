const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const OUTPUT_DIR = path.join(__dirname, 'playlists');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
console.log(`📺 Loaded ${channels.length} channels\n`);

// Group by category
const byCategory = {};
channels.forEach(ch => {
  const cat = ch.group || 'general';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(ch);
});

// Sort channels within each category by name
Object.values(byCategory).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));

// Generate M3U per category
const categories = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);

let totalFiles = 0;
categories.forEach(([cat, catChannels]) => {
  const filename = path.join(OUTPUT_DIR, `${cat}.m3u`);
  let content = '#EXTM3U\n';
  
  catChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const group = ch.group || cat;
    const country = ch.countryFlag ? `${ch.countryFlag} ${ch.country}` : ch.country || '';
    content += `#EXTINF:-1 ${logo} group-title="${group}",${ch.name} (${country})\n`;
    content += `${ch.url}\n`;
  });
  
  fs.writeFileSync(filename, content);
  totalFiles++;
  console.log(`✅ ${cat}: ${catChannels.length} channels -> ${filename}`);
});

console.log(`\n🎉 Generated ${totalFiles} category playlists in ${OUTPUT_DIR}`);

// Also generate combined index.category.m3u
const indexPath = path.join(OUTPUT_DIR, 'index.category.m3u');
let indexContent = '#EXTM3U\n';
categories.forEach(([cat, catChannels]) => {
  catChannels.forEach(ch => {
    const logo = ch.logo ? `tvg-logo="${ch.logo}"` : '';
    const country = ch.countryFlag ? `${ch.countryFlag} ${ch.country}` : ch.country || '';
    indexContent += `#EXTINF:-1 ${logo} group-title="${cat}",${ch.name} (${country})\n`;
    indexContent += `${ch.url}\n`;
  });
});
fs.writeFileSync(indexPath, indexContent);
console.log(`✅ Combined index.category.m3u -> ${indexPath}`);

// Save summary
const summary = {
  totalChannels: channels.length,
  totalCategories: categories.length,
  categories: categories.map(([name, chs]) => ({
    name,
    count: chs.length,
    file: `${name}.m3u`
  })),
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`✅ Summary saved -> ${path.join(OUTPUT_DIR, 'summary.json')}`);
