// ============================================================
// Phase 2 v2 — channel pages -> player URL -> real source URL
// canlitv.me / ecanlitvizle.live : geolive.php?...&security=...
//                                -> yayin.php|embed.php?...    -> broadcaster page
// canlitv.com                   : /player/index.php?id=N      -> .m3u8
// Output: .research/canlitv_channels.json
// ============================================================
const fs = require('fs');
const path = require('path');

const RESEARCH = path.join(__dirname, '.research');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 6;
const raw = JSON.parse(fs.readFileSync(path.join(RESEARCH, 'raw_channels.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, referer) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': referer || url, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' },
    redirect: 'follow'
  });
  return { status: r.status, text: await r.text() };
}
async function mapPool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e.message }; }
      await sleep(110);
    }
  }));
  return out;
}

const cleanName = (title, h1) => {
  let n = (h1 || title || '').trim();
  n = n.replace(/\s*\|\s*Canlitv\.com.*$/i, '');
  n = n.replace(/\s+Canl[ıi]\s+[İI]zle.*$/i, '');
  n = n.replace(/\s+Canl[ıi]\s*izle.*$/i, '');
  n = n.replace(/\s+Canl[ıi].*$/i, '');
  n = n.replace(/\s*[-–]\s*(HD|SD)\s*(Kesintisiz\s*Yay[ıi]n.*)?$/i, '');
  n = n.replace(/\s+(HD|SD)(\s+Kesintisiz.*)?$/i, '');
  n = n.replace(/\s+(Kesintisiz|Yay[ıi]n).*$/i, '');
  n = n.replace(/\s{2,}/g, ' ').trim();
  return n || (title || '').trim();
};

const COUNTRY_BY_CATEGORY = [
  [/azeri|azerbaycan|azerba/i, 'AZ'], [/france|fransa/i, 'FR'], [/germany|almanya|alman/i, 'DE'],
  [/k[ıi]br[ıi]s/i, 'CY'], [/kurtce|kurd/i, 'TR'], [/turkmenistan/i, 'TM'],
  [/abd|amerika|usa/i, 'US'], [/suudi|saudi/i, 'SA'], [/yunanistan|yunan/i, 'GR'],
  [/ulusalkanallar|genel|yerel|haber|dini|spor|m[üu]zik|cocuk|belgesel|eğitim|sinema|deg[ıi]r|kapanan/i, 'TR']
];
const countryFromCategory = cat => {
  for (const [re, code] of COUNTRY_BY_CATEGORY) if (re.test(cat || '')) return code;
  return 'TR';
};

const NOISE = /google|gstatic|googleapis|fontawesome|bootstrapcdn|cdnjs|cloudflare|sharethis|controlpush|w3\.org|schema\.org|facebook|twitter|instagram|youtube|whatsapp|telegram|tiktok|jquery|wp-|wordpress|theme|advert|adsbygoogle|doubleclick|gravatar|gmpg|pixel/i;
const SITE_HOST = { 'canlitv.me': 'canlitv.me', 'ecanlitvizle.live': 'ecanlitvizle.live', 'canlitv.com': 'canlitv.com' };

// player url on the channel page
function playerUrl(site, html) {
  if (site === 'canlitv.com') {
    const abs = (html.match(/https:\/\/canlitv\.com\/player\/index\.php\?[^"'<>&]+/) || [])[0];
    if (abs) return abs;
    const rel = (html.match(/\/player\/index\.php\?[^"'<>&]+/) || [])[0];
    return rel ? 'https://canlitv.com' + rel : null;
  }
  const host = site === 'canlitv.me' ? 'www.canlitv.me' : 'www.ecanlitvizle.live';
  const m = html.match(new RegExp('https://' + host.replace(/\./g, '\\.') + '/(?:geolive|embed|yayin)\\.php\\?[^"\'<>&]+'));
  return m ? m[0] : null;
}

// first hop: geolive/embed page -> next url
function nextHop(site, html) {
  const host = site === 'canlitv.me' ? 'www.canlitv.me' : 'www.ecanlitvizle.live';
  const m = html.match(new RegExp('https://' + host.replace(/\./g, '\\.') + '/(?:yayin|embed|geovin|geooff)\\.php\\?[^"\'<>&]+'));
  if (m) return m[0];
  const m3u = (html.match(/https?:\/\/[^"'<>\s]+\.m3u8?[^"'<>\s]*/i) || [])[0];
  return m3u || null;
}

function pickSource(html, site) {
  const m3u = (html.match(/https?:\/\/[^"'<>\s]+\.m3u8?[^"'<>\s]*/i) || [])[0];
  if (m3u) return { url: m3u, kind: 'm3u8' };
  const host = SITE_HOST[site];
  const links = [...html.matchAll(/https?:\/\/[^"'<>\s]+/g)].map(m => m[0])
    .map(u => u.replace(/&amp;/g, '&'))
    .filter(u => u.length > 12 && !u.includes(host) && !NOISE.test(u));
  const best = links.find(u => /canli|yayin|live|tv|broadcast|medya|trt|atv|show|star|kanal|bein|ntv|haber|spor|turk/i.test(u)) || links[0];
  return best ? { url: best, kind: 'page' } : { url: null, kind: 'none' };
}

(async () => {
  const tasks = [];
  for (const [site, data] of Object.entries(raw)) {
    for (const url of data.channels) {
      const listUrl = data.source[url] || '';
      const catMatch = listUrl.match(/\/category\/([^/]+)/);
      const cat = catMatch ? catMatch[1] : (site === 'canlitv.com' ? listUrl.replace(/^https?:\/\/[^/]+\//, '') : '');
      tasks.push({ site, url, cat });
    }
  }
  console.log('channel pages:', tasks.length);

  const pages = await mapPool(tasks, async (t) => {
    const r = await get(t.url);
    if (r.status !== 200) return { ...t, status: r.status };
    const title = (r.text.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const h1 = (r.text.match(/<h1[^>]*>([^<]{1,120})<\/h1>/i) || [])[1] || '';
    return { ...t, status: 200, name: cleanName(title, h1), playerUrl: playerUrl(t.site, r.text) };
  });
  const ok = pages.filter(p => p.status === 200 && p.name);
  console.log('pages ok:', ok.length, 'failed:', pages.length - ok.length, 'with player:', ok.filter(p => p.playerUrl).length);

  const resolved = await mapPool(ok.filter(p => p.playerUrl), async (p) => {
    try {
      const first = await get(p.playerUrl, p.url);
      let source = null, kind = 'none';
      if (p.site === 'canlitv.com') {
        const s = pickSource(first.text, p.site);
        source = s.url; kind = s.kind;
      } else {
        const hop = nextHop(p.site, first.text);
        if (hop) {
          const second = await get(hop, p.url);
          const s = pickSource(second.text, p.site);
          source = s.url; kind = s.kind;
        } else {
          const s = pickSource(first.text, p.site);
          source = s.url; kind = s.kind;
        }
      }
      return { ...p, sourceUrl: source, sourceKind: kind };
    } catch (e) {
      return { ...p, sourceUrl: null, sourceKind: 'error', error: e.message };
    }
  });

  const failed = pages.filter(p => p.status !== 200).map(p => ({ site: p.site, url: p.url, status: p.status }));
  const out = {
    generated: new Date().toISOString(),
    sites: Object.fromEntries(Object.keys(raw).map(k => [k, raw[k].channels.length])),
    totals: {
      channelPages: tasks.length,
      pagesOk: ok.length,
      withPlayer: ok.filter(p => p.playerUrl).length,
      resolved: resolved.filter(r => r.sourceUrl).length,
      m3u8: resolved.filter(r => r.sourceKind === 'm3u8').length,
      page: resolved.filter(r => r.sourceKind === 'page').length
    },
    failed,
    channels: resolved.map(r => ({
      name: r.name,
      site: r.site,
      category: r.cat,
      country: countryFromCategory(r.cat),
      channelUrl: r.url,
      playerUrl: r.playerUrl,
      sourceUrl: r.sourceUrl,
      sourceKind: r.sourceKind
    }))
  };
  fs.writeFileSync(path.join(RESEARCH, 'canlitv_channels.json'), JSON.stringify(out, null, 2));
  console.log('\ntotals:', JSON.stringify(out.totals));
  console.log('written .research/canlitv_channels.json');
})();
