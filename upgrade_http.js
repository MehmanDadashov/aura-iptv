// Upgrade http:// stream URLs to https:// where the host actually serves TLS.
// Usage: node upgrade_http.js [conc] [timeout]
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ROOT = __dirname;
const CONC = Number(process.argv[2] || 24);
const TIMEOUT = Number(process.argv[3] || 6);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'channels.json'), 'utf8'));
const targets = list.filter(c => c.url.startsWith('http://')).map(c => ({ id: c.id, http: c.url, https: 'https://' + c.url.slice('http://'.length) }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function probe(t, wid) {
  return new Promise(resolve => {
    const tmp = path.join('/tmp', `up_${process.pid}_${wid}`);
    execFile('curl', ['-sL', '-m', String(TIMEOUT), '-o', tmp, '-w', '%{http_code}\t%{content_type}',
      '-A', UA, '-e', 'https://tv.ai-studio.se/', t.https],
      { timeout: TIMEOUT * 1000 + 3000, maxBuffer: 1 << 20 }, (err, stdout) => {
        let head = '';
        try { head = fs.readFileSync(tmp, 'latin1').slice(0, 2048); } catch (e) {}
        try { fs.unlinkSync(tmp); } catch (e) {}
        if (err && !stdout) return resolve({ ...t, ok: false });
        const [code, ct] = String(stdout).trim().split('\t');
        const c = parseInt(code, 10) || 0;
        const isMedia = (ct || '').toLowerCase().includes('mpegurl') || head.trimStart().startsWith('#EXTM3U');
        resolve({ ...t, ok: c >= 200 && c < 400 && isMedia, http: c });
      });
  });
}

(async () => {
  const t0 = Date.now();
  const out = new Array(targets.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async (_, wid) => {
    while (i < targets.length) {
      const idx = i++;
      out[idx] = await probe(targets[idx], wid);
      if (idx % 200 === 0) { console.log('  checked', idx, '/', targets.length, Math.round((Date.now() - t0) / 1000) + 's'); await sleep(20); }
    }
  }));
  const ok = out.filter(r => r.ok);
  console.log(JSON.stringify({ httpUrls: targets.length, httpsWorks: ok.length, elapsedSec: Math.round((Date.now() - t0) / 1000) }, null, 2));
  fs.writeFileSync(path.join(ROOT, '.research', 'https_upgrade.json'), JSON.stringify(ok.map(r => ({ id: r.id, url: r.https })), null, 2));
  console.log('written .research/https_upgrade.json');
})();
