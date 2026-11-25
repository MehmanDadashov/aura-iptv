// ============================================================
// Probe every channel stream, classify it, optionally drop inactive.
//   active     -> 2xx + media / HLS manifest
//   restricted -> 403 / 429 / 503 (geo or hotlink protection)
//   page       -> 2xx but HTML player page (not directly playable)
//   dead       -> 404 / 410 / 400 / non-media body
//   offline    -> connection error / timeout
// Usage: node probe_catalog.js [--dry]
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_FILE = path.join(ROOT, 'data', 'channels.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'channels.json');
const OUTFILE = path.join(ROOT, '.research', 'probe_results.json');
const DRY = process.argv.includes('--dry');
const CONCURRENCY = Number(process.env.CONC || 40);
const TIMEOUT = Number(process.env.TIMEOUT || 9000);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const list = JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probe(ch) {
  const url = ch.url;
  if (!url || !/^https?:\/\//i.test(url)) return { ...ch, status: 'offline', http: 0, detail: 'no url' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': 'https://tv.ai-studio.se/',
        'Origin': 'https://tv.ai-studio.se'
      }
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    let head = '';
    try {
      const reader = r.body.getReader();
      const { value } = await reader.read();
      await reader.cancel().catch(() => {});
      head = Buffer.from(value || []).slice(0, 4096).toString('latin1');
    } catch (e) { /* stream already gone */ }

    let status;
    if (r.status === 403 || r.status === 429 || r.status === 503) status = 'restricted';
    else if (r.status === 404 || r.status === 410 || r.status === 400 || r.status === 451 || r.status === 405) status = 'dead';
    else if (r.ok) {
      if (ct.includes('mpegurl') || ct.includes('mpegurl') || ct.includes('.apple.mpegurl') || head.startsWith('#EXTM3U')) status = 'active';
      else if (ct.includes('text/html') || head.includes('<html') || head.includes('<!doctype')) status = 'page';
      else if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('octet-stream')) status = 'active';
      else status = 'page';
    } else status = 'dead';
    return { ...ch, status, http: r.status, contentType: ct, detail: '' };
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return { ...ch, status: 'offline', http: 0, detail: aborted ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const t0 = Date.now();
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await probe(list[idx]);
      if (idx % 200 === 0) console.log('  probed', idx, '/', list.length, 'elapsed', Math.round((Date.now() - t0) / 1000) + 's');
      await sleep(10);
    }
  }));

  const by = {};
  for (const r of out) by[r.status] = (by[r.status] || 0) + 1;
  const elapsed = Math.round((Date.now() - t0) / 1000);

  // keep active + restricted, drop page / dead / offline
  const kept = out.filter(r => r.status === 'active' || r.status === 'restricted');
  const dropped = out.filter(r => !(r.status === 'active' || r.status === 'restricted'));

  for (const r of kept) { delete r.contentType; delete r.detail; }
  for (const r of dropped) { delete r.contentType; }

  const summary = {
    elapsedSec: elapsed,
    total: out.length,
    byStatus: by,
    kept: kept.length,
    dropped: dropped.length
  };
  console.log('\n' + JSON.stringify(summary, null, 2));

  fs.writeFileSync(OUTFILE, JSON.stringify({
    generated: new Date().toISOString(),
    elapsedSec: elapsed,
    summary,
    dropped: dropped.map(r => ({ id: r.id, name: r.name, country: r.country, status: r.status, http: r.http, url: r.url })),
    channels: out.map(r => ({ id: r.id, status: r.status, http: r.http }))
  }, null, 2));

  if (DRY) { console.log('\n--dry: catalog not rewritten'); return; }

  const cleaned = kept.map(r => {
    const { status, http, contentType, detail, ...rest } = r;
    return { ...rest, probe: { status, http } };
  });
  cleaned.sort((a, b) => a.name.localeCompare(b.name) || String(a.country).localeCompare(String(b.country)));
  fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ channels: cleaned }));
  fs.writeFileSync(SERVER_FILE, JSON.stringify(cleaned));
  console.log('written catalog:', cleaned.length);
})();
