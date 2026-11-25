// ============================================================
// AURA IPTV — canonical catalog builder
// Dedupes the channel catalog, repairs broken names, normalises
// quality labels, keeps alternates as failover, and writes the
// same canonical set to data/ (server proxy) and public/data/ (web).
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const OUT_PUBLIC = PUBLIC_FILE;
const OUT_SERVER = SERVER_FILE;
const DRY = process.argv.includes('--dry');

// quality buckets, best first (matches the ORDER map in ui.js)
const BUCKETS = [2160, 1440, 1080, 720, 576, 480, 360, 240, 144];
const ORDER = {
  '4320p': 0, '2160p': 1, '1440p': 2, '1080p': 3, '720p': 4, '576p': 5,
  '480p': 6, '360p': 7, '240p': 8, '144p': 9, 'SD': 10, 'Unknown': 11
};

function bucketOf(h) {
  if (!h) return null;
  for (const b of BUCKETS) if (h >= b) return b + 'p';
  return 'SD';
}

// "Channel (1080p)" -> { base: "Channel", res: "1080p" }
function splitName(raw) {
  let n = String(raw || '').trim();
  // M3U parse artifact: 'like Gecko) Chrome/.. Safari/.. " group-title="X",Real Name'
  const gi = n.indexOf('group-title=');
  if (gi !== -1) {
    const comma = n.indexOf(',', gi);
    if (comma !== -1) n = n.slice(comma + 1);
  }
  n = n.replace(/\s+/g, ' ').trim();
  let res = null;
  const m = n.match(/\((\d{3,4})p\)/i);
  if (m) {
    res = bucketOf(parseInt(m[1], 10));
    n = n.replace(m[0], '').trim();
  }
  if (/\b(4K|UHD)\b/i.test(n)) { res = res || '2160p'; n = n.replace(/\b(4K|UHD)\b/gi, '').trim(); }
  if (/\bHD\b/i.test(n)) { res = res || '720p'; n = n.replace(/\bHD\b/gi, '').trim(); }
  if (/\bSD\b/i.test(n)) { res = res || 'SD'; n = n.replace(/\bSD\b/gi, '').trim(); }
  n = n.replace(/\s+/g, ' ').replace(/[\s._-]+$/, '').trim();
  return { base: n, res };
}

function loadJSON(p) {
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(d) ? d : (d.channels || []);
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 60) || 'ch';
}

const publicRows = loadJSON(PUBLIC_FILE);
const serverRows = loadJSON(SERVER_FILE);

// probe info keyed by id (verified subset)
const probeById = new Map();
for (const c of serverRows) {
  if (c && c.id) probeById.set(c.id, c);
}

const groups = new Map();
let junkFixed = 0, noName = 0, badUrl = 0;

for (const c of publicRows) {
  if (!c || typeof c !== 'object') continue;
  const rawName = c.name;
  const { base, res } = splitName(rawName);
  if (base !== String(rawName || '').trim()) junkFixed++;
  if (!base) { noName++; continue; }
  const url = String(c.url || '').trim();
  if (!/^https?:\/\//i.test(url)) { badUrl++; continue; }
  const country = String(c.country || 'XX').trim() || 'XX';
  const key = base.toLowerCase() + '|' + country;
  if (!groups.has(key)) groups.set(key, { base, country, variants: new Map() });
  const g = groups.get(key);
  if (!g.variants.has(url)) {
    const probed = probeById.get(c.id);
    g.variants.set(url, {
      url,
      res: res || (probed && probed.resolution) || null,
      qualityOrder: res ? ORDER[res] : (probed && probed.qualityOrder) != null ? probed.qualityOrder : 99,
      verified: !!(probed && probed.probe),
      masterH: probed && probed.probe ? probed.probe.master_h : null,
      probe: probed && probed.probe ? probed.probe : null,
      logo: c.logo || '',
      group: c.group || 'General',
      language: c.language || '',
      tvgId: c.tvgId || ''
    });
  } else {
    // keep the best quality label for an existing url
    const prev = g.variants.get(url);
    if (res && (!prev.res || ORDER[res] < ORDER[prev.res])) { prev.res = res; prev.qualityOrder = ORDER[res]; }
  }
}

function rank(v) {
  // verified first, then https, then best quality, then shortest url
  return (
    (v.verified ? 0 : 1) * 1e9 +
    (/^https:/i.test(v.url) ? 0 : 1) * 1e8 +
    (v.qualityOrder != null ? v.qualityOrder : 99) * 1e6 +
    Math.min(v.url.length, 9999) / 1e5
  );
}

let out = [];
const usedIds = new Set();
for (const g of groups.values()) {
  const variants = [...g.variants.values()].sort((a, b) => rank(a) - rank(b));
  const primary = variants[0];
  const backups = variants.slice(1, 4).map(v => v.url);
  let id = slug(g.base) + '.' + g.country.toLowerCase();
  let n = 2;
  while (usedIds.has(id)) { id = slug(g.base) + '.' + g.country.toLowerCase() + '.' + (n++); }
  usedIds.add(id);
  out.push({
    id,
    name: g.base,
    logo: primary.logo,
    group: primary.group,
    country: g.country,
    language: primary.language,
    url: primary.url,
    tvgId: primary.tvgId,
    resolution: primary.res || 'Unknown',
    qualityOrder: primary.qualityOrder != null ? primary.qualityOrder : 99,
    backupUrls: backups,
    verified: primary.verified,
    probe: primary.probe
  });
}

out.sort((a, b) => a.name.localeCompare(b.name) || a.country.localeCompare(b.country));

// Same stream (identical name + URL) listed under several country codes is
// still one channel — keep a single entry so nothing duplicates in the UI.
const seenStream = new Set();
let crossCountryDupes = 0;
out = out.filter(c => {
  const k = c.name.toLowerCase() + '|' + c.url;
  if (seenStream.has(k)) { crossCountryDupes++; return false; }
  seenStream.add(k);
  return true;
});

// ---- stats ----
const dupRemoved = publicRows.length - out.length;
const stats = {
  input: publicRows.length,
  output: out.length,
  duplicateRowsRemoved: dupRemoved,
  sameStreamOtherCountryRemoved: crossCountryDupes,
  junkNamesRepaired: junkFixed,
  rowsWithoutName: noName,
  rowsWithoutUrl: badUrl,
  withBackup: out.filter(c => c.backupUrls.length).length,
  verified: out.filter(c => c.verified).length,
  byResolution: {}
};
for (const c of out) stats.byResolution[c.resolution] = (stats.byResolution[c.resolution] || 0) + 1;

console.log(JSON.stringify(stats, null, 2));

if (DRY) { console.log('\n--dry: nothing written'); process.exit(0); }

fs.writeFileSync(OUT_PUBLIC, JSON.stringify({ channels: out }));
fs.writeFileSync(OUT_SERVER, JSON.stringify(out));
console.log('\nwritten:', OUT_PUBLIC, OUT_SERVER);
