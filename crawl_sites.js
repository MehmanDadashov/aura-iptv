// ============================================================
// Phase 1 — discover every channel page on the three sites
// ============================================================
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '.research', 'raw_channels.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': referer || url, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' }, redirect: 'follow' });
  const text = await r.text();
  return { status: r.status, text, finalUrl: r.url };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SITES = [
  {
    name: 'canlitv.me',
    base: 'https://www.canlitv.me',
    lists: [
      'https://www.canlitv.me/live',
      'https://www.canlitv.me/allcategory',
      'https://www.canlitv.me/category/haber-kanallari-izle',
      'https://www.canlitv.me/category/muzik-kanallari',
      'https://www.canlitv.me/category/spor-kanallari-hd',
      'https://www.canlitv.me/category/ulusalkanallar'
    ],
    // channel page = /live/<slug>
    extract: html => [...html.matchAll(/href="(https:\/\/www\.canlitv\.me\/live\/[^"#?]+)"/g)].map(m => m[1])
  },
  {
    name: 'ecanlitvizle.live',
    base: 'https://www.ecanlitvizle.live',
    lists: [
      'https://www.ecanlitvizle.live/',
      ...['azeri-tv-kanallari-izle','cocuk-tv-kanallari','diger-canli-yayinlar','dini-tv-kanallari','egitim-kanallari','france-channels','genel-kanallar','germany-channels','haber-kanallari','kapanan-tv-kanallari','kibris-tv-kanallari','kurtce-kanallar','muzik-tv-kanallari','sinema-tv-kanallari','spor-kanallari-canli','yerel-tv-kanallari']
        .map(c => 'https://www.ecanlitvizle.live/category/' + c + '/')
    ],
    // channel page = /<slug>/ but not /category/
    extract: html => [...html.matchAll(/href="(https:\/\/www\.ecanlitvizle\.live\/[^"#?]+\/)"/g)]
      .map(m => m[1])
      .filter(u => !u.includes('/category/') && !u.endsWith('/hakkinda/') && !u.endsWith('/iletisim/') && !u.includes('/akilli-isaretler'))
  },
  {
    name: 'canlitv.com',
    base: 'https://canlitv.com',
    lists: [
      'https://canlitv.com/tr',
      ...['turkiye-kanallari','genel-tv-kanallari','yerel-tv-kanallari','haber-kanallari','azerbaycan-kanallari','dini-tv-kanallari','cocuk-kanallari','spor-kanallari','müzik-kanallari','kibris-kanallari','belgesel-kanallari','almanya-kanallari','turkmenistan-kanallari','abd-kanallari','suudi-arabistan-kanallari','yunanistan-kanallari']
        .map(c => 'https://canlitv.com/' + c)
    ],
    // channel page = /<slug> (root relative), exclude known non-channel paths
    extract: html => [...html.matchAll(/href="(\/[a-z0-9-]{2,50})"/g)]
      .map(m => 'https://canlitv.com' + m[1])
      .filter(u => !/^\/?(yayin-akisi|uydu-frekanslari|rating|blog|kanal-oner|televizyonlar|kameralar|favoriler|fav\.ico|style\.css|css)/i.test(u))
  }
];

(async () => {
  const result = {};
  for (const site of SITES) {
    const found = new Map();
    let listCount = 0;
    for (const url of site.lists) {
      try {
        const { status, text } = await get(url, site.base);
        listCount++;
        if (status !== 200) { console.log('  !', site.name, url, status); continue; }
        for (const u of site.extract(text)) {
          if (!found.has(u)) found.set(u, url);
        }
      } catch (e) {
        console.log('  ERR', site.name, url, e.message);
      }
      await sleep(250);
    }
    result[site.name] = { listPages: listCount, channels: [...found.keys()], source: [...found.entries()].reduce((a, [u, l]) => { a[u] = l; return a; }, {}) };
    console.log(site.name, '->', found.size, 'channel pages from', listCount, 'list pages');
  }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('\nwritten', OUT);
})();
