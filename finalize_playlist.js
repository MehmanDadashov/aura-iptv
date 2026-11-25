// ============================================================
// Finalize the playlist:
//   1. import the approved canlitv channels (deduped, idempotent)
//   2. drop channels the probe classified as page / dead / offline
//   3. write catalog + report
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const PENDING = path.join(ROOT, 'reports', 'canlitv-pending-import.json');
const PROBE = path.join(ROOT, '.research', 'probe_curl_results.json');
const DRY = process.argv.includes('--dry');

const key = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
// Only clearly-dead HTTP codes are dropped on the "dead" bucket; redirects and
// 5xx are kept as "unstable" so a transient error never deletes a live channel.
const CLEAR_DEAD = new Set([400, 401, 404, 405, 410, 451]);
const isDead = r => r.status === 'offline' || (r.status === 'dead' && CLEAR_DEAD.has(r.http));

const list = JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));
const before = list.length;

// ---- 1. import approved ----
let noUrl = 0, dup = 0, addedNew = 0, asBackup = 0;
const pending = fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, 'utf8')).channels : [];
const byNameUrl = new Set(), byNameCountry = new Map(), nameIndex = new Map();
list.forEach((c, i) => {
  const n = key(c.name);
  byNameUrl.add(n + '|' + c.url);
  byNameCountry.set(n + '|' + c.country, i);
  if (!nameIndex.has(n)) nameIndex.set(n, []);
  nameIndex.get(n).push(i);
});
const imported = [];
for (const r of pending) {
  if (!r.url) { noUrl++; continue; }
  const n = key(r.name);
  if (byNameUrl.has(n + '|' + r.url)) { dup++; continue; }
  const idxSame = byNameCountry.get(n + '|' + r.country);
  const same = nameIndex.get(n) || [];
  if (idxSame !== undefined || same.length === 1) {
    const t = idxSame !== undefined ? idxSame : same[0];
    const ch = list[t];
    ch.backupUrls = ch.backupUrls || [];
    if (ch.url !== r.url && !ch.backupUrls.includes(r.url) && ch.backupUrls.length < 3) { ch.backupUrls.push(r.url); asBackup++; }
    else dup++;
    continue;
  }
  if (same.length > 1) { dup++; continue; }
  const rec = {
    id: r.id, name: r.name, logo: r.logo || '', group: r.group || 'General',
    country: r.country, language: r.language || '', url: r.url, tvgId: '',
    resolution: 'Unknown', qualityOrder: 99, backupUrls: r.backupUrls || [],
    verified: false, probe: null, importedFrom: r.sourceSite || 'canlitv'
  };
  list.push(rec);
  const ni = list.length - 1;
  byNameUrl.add(n + '|' + r.url);
  byNameCountry.set(n + '|' + r.country, ni);
  if (!nameIndex.has(n)) nameIndex.set(n, []);
  nameIndex.get(n).push(ni);
  addedNew++; imported.push(rec);
}

// ---- 2. drop inactive (per probe) ----
const probe = fs.existsSync(PROBE) ? JSON.parse(fs.readFileSync(PROBE, 'utf8')) : null;
const statusById = new Map();
if (probe) for (const c of probe.channels || []) statusById.set(c.id, c);

const kept = [], dropped = [];
for (const c of list) {
  const st = statusById.get(c.id);
  if (st === undefined) { kept.push(c); continue; }        // not probed -> keep, flag
  if (isDead(st)) dropped.push({ ...c, probeStatus: st.status, http: st.http });
  else kept.push(c);
}
const unprobed = kept.filter(c => !statusById.has(c.id)).length;

kept.sort((a, b) => a.name.localeCompare(b.name) || String(a.country).localeCompare(String(b.country)));

const byStatus = {};
for (const d of dropped) byStatus[d.probeStatus] = (byStatus[d.probeStatus] || 0) + 1;

console.log(JSON.stringify({
  catalogBefore: before,
  pending: pending.length, pendingWithoutUrl: noUrl, alreadyPresent: dup,
  importedNew: addedNew, importedAsBackup: asBackup,
  probeAvailable: !!probe,
  probeTotal: probe ? probe.channels.length : 0,
  dropped: dropped.length, byStatus,
  unprobedKept: unprobed,
  catalogAfter: kept.length
}, null, 2));

if (DRY) { console.log('\n--dry'); process.exit(0); }

fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ channels: kept }));
fs.writeFileSync(SERVER_FILE, JSON.stringify(kept));
fs.writeFileSync(path.join(ROOT, '.research', 'dropped_channels.json'), JSON.stringify(dropped, null, 2));
console.log('written catalog:', kept.length, '| dropped saved to .research/dropped_channels.json');
