// ============================================================
// Import the approved canlitv pending list into the catalog.
// Dedupe contract: (normalised name, url) and (normalised name, country).
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const PENDING = path.join(ROOT, 'reports', 'canlitv-pending-import.json');
const DRY = process.argv.includes('--dry');

function splitName(raw) {
  let n = String(raw || '').trim();
  const gi = n.indexOf('group-title=');
  if (gi !== -1) { const c = n.indexOf(',', gi); if (c !== -1) n = n.slice(c + 1); }
  n = n.replace(/\s+/g, ' ').trim();
  const m = n.match(/\((\d{3,4})p\)/i);
  if (m) n = n.replace(m[0], '').trim();
  if (/\b(4K|UHD)\b/i.test(n)) n = n.replace(/\b(4K|UHD)\b/gi, '').trim();
  if (/\bHD\b/i.test(n)) n = n.replace(/\bHD\b/gi, '').trim();
  if (/\bSD\b/i.test(n)) n = n.replace(/\bSD\b/gi, '').trim();
  n = n.replace(/\s+/g, ' ').replace(/[\s._-]+$/, '').trim();
  return n;
}

const list = JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));
const pending = JSON.parse(fs.readFileSync(PENDING, 'utf8')).channels;

const byNameUrl = new Set();
const byNameCountry = new Map();
const nameCount = new Map();
for (const c of list) {
  const n = splitName(c.name).toLowerCase();
  byNameUrl.add(n + '|' + String(c.url));
  byNameCountry.set(n + '|' + c.country, true);
  nameCount.set(n, (nameCount.get(n) || 0) + 1);
}

let noUrl = 0, dupUrl = 0, dupCountry = 0, added = 0, addedBackup = 0;
const newOnes = [];
for (const p of pending) {
  if (!p.url) { noUrl++; continue; }
  const n = splitName(p.name).toLowerCase();
  if (byNameUrl.has(n + '|' + p.url)) { dupUrl++; continue; }
  if (byNameCountry.has(n + '|' + p.country)) { dupCountry++; continue; }
  const rec = {
    id: p.id,
    name: splitName(p.name),
    logo: p.logo || '',
    group: p.group || 'General',
    country: p.country,
    language: p.language || '',
    url: p.url,
    tvgId: '',
    resolution: p.resolution || 'Unknown',
    qualityOrder: p.qualityOrder != null ? p.qualityOrder : 99,
    backupUrls: p.backupUrls || [],
    verified: false,
    probe: null,
    importedFrom: p.sourceSite || 'canlitv'
  };
  list.push(rec);
  byNameUrl.add(n + '|' + p.url);
  byNameCountry.set(n + '|' + p.country, true);
  nameCount.set(n, (nameCount.get(n) || 0) + 1);
  added++;
  newOnes.push(rec);
}
list.sort((a, b) => a.name.localeCompare(b.name) || String(a.country).localeCompare(String(b.country)));

console.log(JSON.stringify({
  pending: pending.length, withoutUrl: noUrl, skippedExistingUrl: dupUrl,
  skippedExistingChannel: dupCountry, added, before: list.length - added, after: list.length
}, null, 2));

if (DRY) { console.log('\n--dry'); process.exit(0); }
fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ channels: list }));
fs.writeFileSync(SERVER_FILE, JSON.stringify(list));
console.log('written');
