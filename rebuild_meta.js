// ============================================================
// AURA IPTV — rebuild countries / categories / stats from the
// canonical catalog in data/channels.json
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CHANNELS = path.join(ROOT, 'data', 'channels.json');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const COUNTRIES_CSV = path.join(ROOT, 'data', 'countries.csv');
const DRY = process.argv.includes('--dry');

const channels = JSON.parse(fs.readFileSync(CHANNELS, 'utf8'));
const list = Array.isArray(channels) ? channels : channels.channels;

// code -> name from the iptv-org countries CSV
const codeName = new Map();
if (fs.existsSync(COUNTRIES_CSV)) {
  const lines = fs.readFileSync(COUNTRIES_CSV, 'utf8').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    const name = (parts[0] || '').trim();
    const code = (parts[1] || '').trim().toUpperCase();
    if (code && name) codeName.set(code, name);
  }
}
// fallback names from the previous countries.json
const prevPath = path.join(OUT_DIR, 'countries.json');
if (fs.existsSync(prevPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    for (const c of prev.countries || []) {
      if (!codeName.has(c.code)) codeName.set(c.code, c.name);
    }
  } catch (e) {}
}
codeName.set('XX', 'International');

const countryCount = new Map();
const catCount = new Map();
let withLogo = 0;
const resCount = {};
for (const c of list) {
  const code = String(c.country || 'XX').trim().toUpperCase() || 'XX';
  countryCount.set(code, (countryCount.get(code) || 0) + 1);
  const g = String(c.group || 'Other').trim() || 'Other';
  catCount.set(g, (catCount.get(g) || 0) + 1);
  if (c.logo) withLogo++;
  const r = c.resolution || 'Unknown';
  resCount[r] = (resCount[r] || 0) + 1;
}

const countries = [...countryCount.entries()]
  .map(([code, count]) => ({ code, name: codeName.get(code) || code, count }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

const categories = [...catCount.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => a.name.localeCompare(b.name));

const stats = {
  total: list.length,
  active: list.length,
  before: 36487,
  removed: { duplicates: 36487 - list.length, broken_url: 0 },
  resolution: resCount,
  countries: countries.length,
  categories: categories.length,
  withLogo,
  verified: list.filter(c => c.verified).length,
  withBackup: list.filter(c => (c.backupUrls || []).length).length,
  updated: new Date().toISOString().slice(0, 10)
};

console.log(JSON.stringify({
  channels: list.length,
  countries: countries.length,
  categories: categories.length,
  withLogo,
  verified: stats.verified,
  withBackup: stats.withBackup,
  topCountries: countries.slice(0, 5),
  topCategories: categories.slice(0, 5)
}, null, 2));

if (DRY) { console.log('\n--dry: nothing written'); process.exit(0); }

fs.writeFileSync(path.join(OUT_DIR, 'countries.json'), JSON.stringify({ countries }));
fs.writeFileSync(path.join(OUT_DIR, 'categories.json'), JSON.stringify({ categories }));
fs.writeFileSync(path.join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));
console.log('\nwritten countries.json / categories.json / stats.json');
