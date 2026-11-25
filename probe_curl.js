// ============================================================
// Full-catalog probe via curl (fast + robust on this box).
//   node probe_curl.js <concurrency>
// Writes .research/probe_curl_results.json
// ============================================================
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const CONC = Number(process.argv[2] || 32);
const TIMEOUT = Number(process.argv[3] || 9);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'channels.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function probe(ch, wid) {
  return new Promise(resolve => {
    const url = ch.url;
    if (!url || !/^https?:\/\//i.test(url)) return resolve({ id: ch.id, status: 'offline', http: 0, detail: 'no url' });
    const tmp = path.join('/tmp', `pr_${process.pid}_${wid}`);
    const args = ['-sL', '-m', String(TIMEOUT), '-o', tmp, '-w', '%{http_code}\t%{content_type}',
      '-A', UA, '-e', 'https://tv.ai-studio.se/', url];
    execFile('curl', args, { timeout: TIMEOUT * 1000 + 4000, maxBuffer: 1 << 20 }, (err, stdout) => {
      let head = '';
      try { head = fs.readFileSync(tmp, 'latin1').slice(0, 4096); } catch (e) {}
      try { fs.unlinkSync(tmp); } catch (e) {}
      if (err && !stdout) return resolve({ id: ch.id, status: 'offline', http: 0, detail: String(err.message || err).slice(0, 60) });
      const parts = String(stdout).trim().split('\t');
      const code = parseInt(parts[0], 10) || 0;
      const ct = (parts[1] || '').toLowerCase();
      let status;
      if (code === 0) status = 'offline';
      else if (code === 403 || code === 429 || code === 503) status = 'restricted';
      else if (code === 404 || code === 410 || code === 400 || code === 451 || code === 405) status = 'dead';
      else if (code >= 200 && code < 300) {
        if (ct.includes('mpegurl') || head.startsWith('#EXTM3U')) status = 'active';
        else if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('octet-stream')) status = 'active';
        else if (ct.includes('text/html') || head.includes('<html') || head.includes('<!doctype')) status = 'page';
        else status = 'page';
      } else status = 'dead';
      resolve({ id: ch.id, status, http: code, ct });
    });
  });
}

(async () => {
  const t0 = Date.now();
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async (_, wid) => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await probe(list[idx], wid);
      if (idx % 500 === 0) {
        console.log('  probed', idx, '/', list.length, Math.round((Date.now() - t0) / 1000) + 's');
        await sleep(20);
      }
    }
  }));
  const by = {};
  for (const r of out) by[r.status] = (by[r.status] || 0) + 1;
  const sec = Math.round((Date.now() - t0) / 1000);
  const summary = { elapsedSec: sec, concurrency: CONC, timeout: TIMEOUT, total: out.length, byStatus: by };
  console.log('\n' + JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ROOT, '.research', 'probe_curl_results.json'), JSON.stringify({ generated: new Date().toISOString(), summary, channels: out }, null, 2));
  console.log('written .research/probe_curl_results.json');
})();
