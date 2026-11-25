// ============================================================
// AURA IPTV — merge newly found channels into the catalog.
// Sources: iptv-org index.country.m3u / index.m3u, Free-TV, Broadcast Atlas.
// Dedupe contract:
//   (normalised name, url)      -> already present, skip
//   (normalised name, country)  -> same channel, other source -> backupUrls
//   normalised name once total  -> same channel elsewhere    -> backupUrls
//   otherwise                   -> NEW channel
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RESEARCH = path.join(ROOT, '.research');
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const COUNTRIES_CSV = path.join(ROOT, 'data', 'countries.csv');
const DRY = process.argv.includes('--dry');

const BUCKETS = [2160, 1440, 1080, 720, 576, 480, 360, 240, 144];
const ORDER = {
  '4320p': 0, '2160p': 1, '1440p': 2, '1080p': 3, '720p': 4, '576p': 5,
  '480p': 6, '360p': 7, '240p': 8, '144p': 9, 'SD': 10, 'Unknown': 11
};
function bucketOf(h) { for (const b of BUCKETS) if (h >= b) return b + 'p'; return 'SD'; }

function splitName(raw) {
  let n = String(raw || '').trim();
  const gi = n.indexOf('group-title=');
  if (gi !== -1) { const c = n.indexOf(',', gi); if (c !== -1) n = n.slice(c + 1); }
  n = n.replace(/\s+/g, ' ').trim();
  let res = null;
  const m = n.match(/\((\d{3,4})p\)/i);
  if (m) { res = bucketOf(parseInt(m[1], 10)); n = n.replace(m[0], '').trim(); }
  if (/\b(4K|UHD)\b/i.test(n)) { res = res || '2160p'; n = n.replace(/\b(4K|UHD)\b/gi, '').trim(); }
  if (/\bHD\b/i.test(n)) { res = res || '720p'; n = n.replace(/\bHD\b/gi, '').trim(); }
  if (/\bSD\b/i.test(n)) { res = res || 'SD'; n = n.replace(/\bSD\b/gi, '').trim(); }
  n = n.replace(/\s+/g, ' ').replace(/[\s._-]+$/, '').trim();
  return { base: n, res };
}

function parseM3U(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF:')) {
      const name = t.slice(t.lastIndexOf(',') + 1).trim();
      const logo = (t.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const group = (t.match(/group-title="([^"]*)"/) || [])[1] || '';
      const tvgId = (t.match(/tvg-id="([^"]*)"/) || [])[1] || '';
      cur = { name, logo, group, tvgId, url: '' };
    } else if (t && !t.startsWith('#') && cur) {
      cur.url = t;
      out.push(cur);
      cur = null;
    }
  }
  return out;
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 60) || 'ch';
}

// --- country name -> ISO code ---
const nameToCode = new Map();
const codeToName = new Map();
if (fs.existsSync(COUNTRIES_CSV)) {
  for (const line of fs.readFileSync(COUNTRIES_CSV, 'utf8').split(/\r?\n/).slice(1)) {
    const p = line.split(',');
    const name = (p[0] || '').trim(), code = (p[1] || '').trim().toUpperCase();
    if (code && name) { nameToCode.set(name.toLowerCase(), code); codeToName.set(code, name); }
  }
}
nameToCode.set('international', 'XX');
nameToCode.set('undefined', 'XX');
nameToCode.set('other', 'XX');

function countryFrom(entry) {
  const g = String(entry.group || '').trim();
  if (g && nameToCode.has(g.toLowerCase())) return nameToCode.get(g.toLowerCase());
  // tvg-id suffix, e.g. "1Plus1International.ua@HD"
  const id = String(entry.tvgId || '');
  const m = id.match(/\.([a-z]{2})(?:\.|@|$)/i);
  if (m && codeToName.has(m[1].toUpperCase())) return m[1].toUpperCase();
  if (g && /^[A-Z]{2}$/.test(g)) return g;
  return 'XX';
}

// --- load existing catalog ---
const existing = JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));
const list = Array.isArray(existing) ? existing : existing.channels;
const catalogBefore = list.length;

const byNameUrl = new Set();
const byNameCountry = new Map();   // name|code -> index
const nameIndex = new Map();       // name -> [indices]
list.forEach((c, i) => {
  const n = splitName(c.name).base.toLowerCase();
  byNameUrl.add(n + '|' + String(c.url));
  byNameCountry.set(n + '|' + c.country, i);
  if (!nameIndex.has(n)) nameIndex.set(n, []);
  nameIndex.get(n).push(i);
});

// --- read sources ---
const sources = [
  ['iptv-org (by country)', path.join(RESEARCH, 'iptv-org-index-country.m3u')],
  ['iptv-org (master index)', path.join(RESEARCH, 'iptv-org-index.m3u')],
  ['Free-TV/IPTV', path.join(RESEARCH, 'freetv.m3u8')],
  ['Broadcast Atlas', path.join(RESEARCH, 'broadcastatlas.m3u')]
].filter(([, p]) => fs.existsSync(p));

const catMap = new Map();
for (const c of list) { const k = String(c.group).toLowerCase(); if (!catMap.has(k)) catMap.set(k, c.group); }
let scanned = 0;
const seenSource = new Set();
const added = [];
let skippedUrl = 0, addedBackup = 0, skippedAmbiguous = 0, noName = 0, noUrl = 0;
const perSource = {};

for (const [label, file] of sources) {
  const rows = parseM3U(fs.readFileSync(file, 'utf8'));
  perSource[label] = { rows: rows.length, new: 0, backup: 0, skipped: 0 };
  for (const r of rows) {
    scanned++;
    const url = String(r.url || '').trim();
    if (!/^https?:\/\//i.test(url)) { noUrl++; continue; }
    const { base, res } = splitName(r.name);
    if (!base) { noName++; continue; }
    const key = base.toLowerCase() + '|' + url;
    if (seenSource.has(key)) { skippedUrl++; perSource[label].skipped++; continue; }
    seenSource.add(key);

    const n = base.toLowerCase();
    if (byNameUrl.has(n + '|' + url)) { skippedUrl++; perSource[label].skipped++; continue; }

    const code = countryFrom(r);
    const idxSameCountry = byNameCountry.get(n + '|' + code);
    const sameName = nameIndex.get(n) || [];

    if (idxSameCountry !== undefined || sameName.length === 1) {
      const target = idxSameCountry !== undefined ? idxSameCountry : sameName[0];
      const ch = list[target];
      if (!ch.backupUrls) ch.backupUrls = [];
      if (ch.url !== url && !ch.backupUrls.includes(url) && ch.backupUrls.length < 3) {
        ch.backupUrls.push(url);
        addedBackup++;
        perSource[label].backup++;
      } else {
        skippedUrl++;
        perSource[label].skipped++;
      }
      continue;
    }
    if (sameName.length > 1) { skippedAmbiguous++; perSource[label].skipped++; continue; }

    const id = slug(base) + '.' + code.toLowerCase();
    // keep the category vocabulary of the app: reuse an existing category name
    // (case-insensitive) or fall back to "Other"
    const gRaw = String(r.group || '').trim();
    const group = catMap.get(gRaw.toLowerCase()) || 'Other';
    const rec = {
      id,
      name: base,
      logo: r.logo || '',
      group,
      country: code,
      language: '',
      url,
      tvgId: r.tvgId || '',
      resolution: res || 'Unknown',
      qualityOrder: res ? ORDER[res] : 99,
      backupUrls: [],
      verified: false,
      probe: null
    };
    list.push(rec);
    const ni = list.length - 1;
    byNameUrl.add(n + '|' + url);
    byNameCountry.set(n + '|' + code, ni);
    if (!nameIndex.has(n)) nameIndex.set(n, []);
    nameIndex.get(n).push(ni);
    added.push(rec);
    perSource[label].new++;
  }
}

list.sort((a, b) => a.name.localeCompare(b.name) || String(a.country).localeCompare(String(b.country)));

const report = {
  scanned,
  alreadyPresent: skippedUrl,
  addedNew: added.length,
  addedAsBackup: addedBackup,
  skippedAmbiguousName: skippedAmbiguous,
  rowsWithoutName: noName,
  rowsWithoutUrl: noUrl,
  catalogBefore,
  catalogAfter: list.length,
  perSource
};
console.log(JSON.stringify(report, null, 2));

if (DRY) { console.log('\n--dry: nothing written'); process.exit(0); }

fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ channels: list }));
fs.writeFileSync(SERVER_FILE, JSON.stringify(list));
console.log('\nwritten:', PUBLIC_FILE, SERVER_FILE);
