// ============================================================
// Import the approved canlitv list into the catalog (deduped).
// Skips records without a playable URL.
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PENDING = path.join(ROOT, 'reports', 'canlitv-pending-import.json');
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const DRY = process.argv.includes('--dry');

const pending = JSON.parse(fs.readFileSync(PENDING, 'utf8')).channels;
const list = JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));

const key = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const byNameUrl = new Set();
const byNameCountry = new Map();
const nameIndex = new Map();
list.forEach((c, i) => {
  const n = key(c.name);
  byNameUrl.add(n + '|' + c.url);
  byNameCountry.set(n + '|' + c.country, i);
  if (!nameIndex.has(n)) nameIndex.set(n, []);
  nameIndex.get(n).push(i);
});

let noUrl = 0, skippedDup = 0, added = 0, asBackup = 0;
const addedList = [];

for (const r of pending) {
  if (!r.url) { noUrl++; continue; }
  const n = key(r.name);
  if (byNameUrl.has(n + '|' + r.url)) { skippedDup++; continue; }
  const idxSame = byNameCountry.get(n + '|' + r.country);
  const same = nameIndex.get(n) || [];
  if (idxSame !== undefined || same.length === 1) {
    const target = idxSame !== undefined ? idxSame : same[0];
    const ch = list[target];
    ch.backupUrls = ch.backupUrls || [];
    if (ch.url !== r.url && !ch.backupUrls.includes(r.url) && ch.backupUrls.length < 3) {
      ch.backupUrls.push(r.url);
      asBackup++;
    } else skippedDup++;
    continue;
  }
  if (same.length > 1) { skippedDup++; continue; }
  const rec = {
    id: r.id,
    name: r.name,
    logo: r.logo || '',
    group: r.group || 'General',
    country: r.country,
    language: r.language || '',
    url: r.url,
    tvgId: '',
    resolution: 'Unknown',
    qualityOrder: 99,
    backupUrls: r.backupUrls || [],
    verified: false,
    probe: null,
    importedFrom: r.sourceSite || 'canlitv'
  };
  list.push(rec);
  const ni = list.length - 1;
  byNameUrl.add(n + '|' + r.url);
  byNameCountry.set(n + '|' + r.country, ni);
  if (!nameIndex.has(n)) nameIndex.set(n, []);
  nameIndex.get(n).push(ni);
  added++; addedList.push(rec);
}

list.sort((a, b) => a.name.localeCompare(b.name) || String(a.country).localeCompare(String(b.country)));

console.log(JSON.stringify({
  pending: pending.length, withoutUrl: noUrl, alreadyPresent: skippedDup,
  addedNew: added, addedAsBackup: asBackup,
  catalogBefore: list.length - added, catalogAfter: list.length
}, null, 2));

if (DRY) { console.log('\n--dry'); process.exit(0); }
fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ channels: list }));
fs.writeFileSync(SERVER_FILE, JSON.stringify(list));
console.log('written');
