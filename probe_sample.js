// Calibrated probe: low concurrency, generous timeout.
// Usage: node probe_sample.js <conc> <timeout>
const fs = require('fs');
const path = require('path');
const CONC = Number(process.argv[2] || 8);
const TIMEOUT = Number(process.argv[3] || 10000);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const items = JSON.parse(fs.readFileSync(path.join(__dirname, '.research', 'sample_probe.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probe({ id, url }) {
  if (!url || !/^https?:\/\//i.test(url)) return { id, status: 'offline', http: 0 };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': 'https://tv.ai-studio.se/' }
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    let head = '';
    try {
      const rd = r.body.getReader();
      const { value } = await rd.read();
      await rd.cancel().catch(() => {});
      head = Buffer.from(value || []).slice(0, 4096).toString('latin1');
    } catch (e) {}
    let status;
    if (r.status === 403 || r.status === 429 || r.status === 503) status = 'restricted';
    else if (r.status === 404 || r.status === 410 || r.status === 400 || r.status === 451 || r.status === 405) status = 'dead';
    else if (r.ok) {
      if (ct.includes('mpegurl') || ct.includes('apple.mpegurl') || head.startsWith('#EXTM3U')) status = 'active';
      else if (ct.includes('text/html') || head.includes('<html') || head.includes('<!doctype')) status = 'page';
      else if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('octet-stream')) status = 'active';
      else status = 'page';
    } else status = 'dead';
    return { id, status, http: r.status };
  } catch (e) {
    return { id, status: 'offline', http: 0, detail: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally { clearTimeout(t); }
}

(async () => {
  const t0 = Date.now();
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await probe(items[idx]);
      await sleep(30);
    }
  }));
  const by = {};
  for (const r of out) by[r.status] = (by[r.status] || 0) + 1;
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(JSON.stringify({ conc: CONC, timeout: TIMEOUT, n: out.length, sec, perSec: +(out.length / sec).toFixed(1), by }, null, 2));
  fs.writeFileSync(path.join(__dirname, '.research', 'sample_probe_result.json'), JSON.stringify(out, null, 2));
})();
