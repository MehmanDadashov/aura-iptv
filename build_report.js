// ============================================================
// AURA IPTV — world report builder
// Emits, from the canonical catalog:
//   reports/AURA-IPTV-World-Report.html  (searchable, by country)
//   reports/AURA-IPTV-World-Channels.csv  (flat list)
//   reports/AURA-IPTV-World.m3u           (playlist, ready for any player)
//   reports/AURA-IPTV-World-Summary.md    (counts + sources)
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'reports');
const PUB = path.join(ROOT, 'public', 'data');

const channels = JSON.parse(fs.readFileSync(path.join(PUB, 'channels.json'), 'utf8')).channels;
const countries = JSON.parse(fs.readFileSync(path.join(PUB, 'countries.json'), 'utf8')).countries;
const categories = JSON.parse(fs.readFileSync(path.join(PUB, 'categories.json'), 'utf8')).categories;
const stats = JSON.parse(fs.readFileSync(path.join(PUB, 'stats.json'), 'utf8'));

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const countryName = new Map(countries.map(c => [c.code, c.name]));
const byCountry = new Map();
for (const c of channels) {
  const code = c.country || 'XX';
  if (!byCountry.has(code)) byCountry.set(code, []);
  byCountry.get(code).push(c);
}
for (const list of byCountry.values()) {
  list.sort((a, b) => a.name.localeCompare(b.name) || a.url.localeCompare(b.url));
}
const countryRows = [...byCountry.entries()]
  .map(([code, list]) => ({ code, name: countryName.get(code) || code, list }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

const nCh = channels.length;
const nCo = countryRows.length;
const nCat = categories.length;
const withLogo = channels.filter(c => c.logo).length;
const withBackup = channels.filter(c => (c.backupUrls || []).length).length;
const date = new Date().toISOString().slice(0, 10);

// ---------------- HTML ----------------
let h = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AURA IPTV — World Online TV Report · ${date}</title>
<style>
:root{--bg:#0b0d16;--panel:#141826;--panel2:#1b2033;--line:#262c42;--txt:#e8ecf7;--mut:#8b93ad;--acc:#667eea;--acc2:#764ba2;--ok:#2fbf71}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 18px 80px}
h1{font-size:30px;margin:0 0 6px;letter-spacing:-.4px}
h2{font-size:20px;margin:0 0 10px}
.sub{color:var(--mut);margin-bottom:22px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0 30px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.card b{display:block;font-size:24px;letter-spacing:-.5px}
.card span{color:var(--mut);font-size:12.5px}
.bar{position:sticky;top:0;z-index:5;background:rgba(11,13,22,.94);backdrop-filter:blur(10px);padding:12px 0;border-bottom:1px solid var(--line);margin-bottom:18px}
.bar input{width:100%;padding:12px 14px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--txt);font-size:15px;outline:none}
.bar input:focus{border-color:var(--acc)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
td.num{color:var(--mut);width:52px}
td.ctr{width:92px;color:var(--mut)}
td.url{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;color:#b9c2dc}
section.country{margin:0 0 12px;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;content-visibility:auto;contain-intrinsic-size:auto 420px}
section.country>summary{cursor:pointer;list-style:none;padding:13px 16px;display:flex;align-items:center;gap:12px;font-weight:650;font-size:16px}
section.country>summary::-webkit-details-marker{display:none}
section.country>summary .code{color:var(--mut);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;width:34px}
section.country>summary .n{margin-left:auto;color:var(--mut);font-size:13px;font-weight:500}
section.country[open]>summary{border-bottom:1px solid var(--line)}
.hide{display:none}
.note{color:var(--mut);font-size:13px;margin:8px 0 0}
footer{margin-top:36px;color:var(--mut);font-size:12.5px;border-top:1px solid var(--line);padding-top:16px}
a{color:var(--acc)}
</style>
</head>
<body>
<div class="wrap">
<h1>AURA IPTV — World Online TV Report</h1>
<div class="sub">Free, legal, publicly available live TV streams · grouped by country · ${date}<br>
Generated from the deduplicated canonical catalog (no duplicate name+stream pairs).</div>

<div class="cards">
  <div class="card"><b>${nCh.toLocaleString('en-US')}</b><span>channels</span></div>
  <div class="card"><b>${nCo}</b><span>countries &amp; territories</span></div>
  <div class="card"><b>${nCat}</b><span>categories</span></div>
  <div class="card"><b>${withLogo.toLocaleString('en-US')}</b><span>with logo</span></div>
  <div class="card"><b>${withBackup.toLocaleString('en-US')}</b><span>with backup source</span></div>
</div>

<div class="bar"><input id="q" type="search" placeholder="Filter countries or channels…" aria-label="Filter"></div>

<div class="cards" id="toc"></div>

<div id="list"></div>

<p class="note">Every stream URL below is the public source published by the broadcaster or a public aggregator.
Availability changes constantly; a channel that is down today may be back tomorrow. ${withBackup.toLocaleString('en-US')} channels also carry backup sources used automatically by the player.</p>

<footer>
Sources: iptv-org/iptv (community index of publicly available channels, 190+ countries, daily updates) ·
Free-TV/IPTV (free-to-air only) · Broadcast Atlas (official streams) · FAST services (Pluto TV, Samsung TV Plus, Plex, Roku, Tubi).<br>
Report generated ${new Date().toISOString()} · Build with ❤ by M@D · Ai-Studio.se
</footer>
</div>
<script>
const COUNTRIES = ${JSON.stringify(countryRows.map(r => ({ code: r.code, name: r.name, n: r.list.length })))};
const DATA = ${JSON.stringify(countryRows.map(r => ({ code: r.code, name: r.name, items: r.list.map(c => [c.name, c.group, c.resolution, c.url]) })))};
const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const toc = document.getElementById('toc');
const list = document.getElementById('list');
toc.innerHTML = COUNTRIES.map(c =>
  '<div class="card country-card" data-name="'+esc(c.name.toLowerCase())+'"><b>'+c.n+'</b><span>'+esc(c.name)+'</span></div>').join('');
function sectionHTML(c, items) {
  return '<section class="country" data-country="'+esc(c.code)+'"><summary>'
    + '<span class="code">'+esc(c.code)+'</span><span>'+esc(c.name)+'</span>'
    + '<span class="n">'+items.length+' channel'+(items.length>1?'s':'')+'</span></summary>'
    + '<table><thead><tr><th class="num">#</th><th>Channel</th><th class="ctr">Category</th><th class="ctr">Quality</th><th>Stream URL</th></tr></thead><tbody>'
    + items.map((i, idx) => '<tr><td class="num">'+(idx+1)+'</td><td>'+esc(i[0])+'</td><td class="ctr">'+esc(i[1])+'</td><td class="ctr">'+esc(i[2])+'</td><td class="url">'+esc(i[3])+'</td></tr>').join('')
    + '</tbody></table></section>';
}

// 16k+ rows: paint in small slices so the page stays interactive from the first frame.
let raf = null;
function render(filter) {
  const f = (filter || '').trim().toLowerCase();
  if (raf) cancelAnimationFrame(raf);
  const groups = [];
  for (const c of DATA) {
    const items = f ? c.items.filter(i => (c.name + ' ' + c.code + ' ' + i[0] + ' ' + i[1]).toLowerCase().includes(f)) : c.items;
    if (items.length) groups.push([c, items]);
  }
  list.innerHTML = '';
  document.querySelectorAll('.country-card').forEach(el => {
    el.classList.toggle('hide', !!f && !el.dataset.name.includes(f));
  });
  let i = 0;
  function step() {
    const t0 = performance.now();
    let out = '';
    while (i < groups.length && performance.now() - t0 < 35) { out += sectionHTML(groups[i][0], groups[i][1]); i++; }
    list.insertAdjacentHTML('beforeend', out);
    raf = i < groups.length ? requestAnimationFrame(step) : null;
  }
  step();
}
let searchTimer = null;
document.getElementById('q').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => render(e.target.value), 140);
});
requestAnimationFrame(function () { render(''); });
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'AURA-IPTV-World-Report.html'), h);

// ---------------- CSV ----------------
const csvHead = 'country_code,country,channel,category,language,quality,stream_url,backup_urls\n';
const csvBody = countryRows.map(r => r.list.map(c =>
  [r.code, r.name, c.name, c.group, c.language || '', c.resolution || '', c.url, (c.backupUrls || []).join(' | ')]
    .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
).join('\n')).join('\n');
fs.writeFileSync(path.join(OUT, 'AURA-IPTV-World-Channels.csv'), csvHead + csvBody + '\n');

// ---------------- M3U ----------------
let m = '#EXTM3U\n';
for (const r of countryRows) {
  for (const c of r.list) {
    const logo = c.logo ? ' tvg-logo="' + c.logo.replace(/"/g, '') + '"' : '';
    m += '#EXTINF:-1 tvg-id="' + c.id.replace(/"/g, '') + '"' + logo + ' group-title="' + r.name.replace(/"/g, '') + '",' + c.name + '\n';
    m += c.url + '\n';
  }
}
fs.writeFileSync(path.join(OUT, 'AURA-IPTV-World.m3u'), m);

// ---------------- Summary MD ----------------
const top = [...countryRows].sort((a, b) => b.list.length - a.list.length).slice(0, 25);
const md = `# AURA IPTV — Отчёт по онлайн-ТВ всех стран мира

Дата: ${date} · Источник данных: канонический каталог AURA IPTV (дедуплицирован)

## Итоги
- **Каналов:** ${nCh.toLocaleString('ru-RU')}
- **Стран и территорий:** ${nCo}
- **Категорий:** ${nCat}
- **С логотипом:** ${withLogo.toLocaleString('ru-RU')}
- **С резервным источником:** ${withBackup.toLocaleString('ru-RU')}

## Топ-25 стран по числу каналов
| Страна | Каналов |
|---|---:|
${top.map(r => '| ' + r.name + ' | ' + r.list.length + ' |').join('\n')}

## Все страны (алфавит)
${countryRows.map(r => '- **' + r.name + '** (' + r.code + ') — ' + r.list.length).join('\n')}

## Источники
1. **iptv-org/iptv** — крупнейший общественный индекс публично доступных IPTV-каналов: \`https://iptv-org.github.io/iptv/index.m3u\` (190+ стран, обновление ежедневно; разбивка по странам \`countries/{cc}.m3u\`, по категориям \`categories/{name}.m3u\`, по языкам \`languages/{lang}.m3u\`).
2. **Free-TV/IPTV** — только free-to-air: \`https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8\` (проверка каналов скриптом \`check_channels.py\`, филтрация по странам \`lists/*.md\`).
3. **Broadcast Atlas** — официальные потоки вещателей: \`https://broadcastatlas.com/official.m3u\`.
4. **Dearbulut** — \`https://dearbulut.github.io/iptv/playlists/country/{cc}.m3u\` (tvg-country, nexus-score).
5. **FAST-сервисы** — Pluto TV, Samsung TV Plus, Plex, Roku, Tubi (публичные M3U-экспорты).

## Файлы
- \`AURA-IPTV-World-Report.html\` — интерактивный отчёт по странам с поиском и стрим-адресами.
- \`AURA-IPTV-World-Channels.csv\` — плоский список: страна, канал, категория, качество, стрим-URL, резервные URL.
- \`AURA-IPTV-World.m3u\` — готовый плейлист на ${nCh.toLocaleString('ru-RU')} каналов для VLC / TiviMate / Kodi / IPTV Smarters.

## Методика и ограничения
- Каталог дедуплицирован по паре (имя в нижнем регистре, URL): один и тот же поток не встречается дважды, даже если он пришёл из разных источников или указан под разными кодами стран.
- У каждого канала есть \`resolution\` и \`qualityOrder\`; у части — \`backupUrls\` для автоматического переключения при недоступности основного источника.
- Публичные потоки живут нестабильно: часть каналов может быть гео-блокирована или офлайн в конкретный момент. В каталоге такие помечаются при наличии в названии (\`[Geo-blocked]\`, \`[Not 24/7]\`).
- В каталог включены только бесплатные и публично транслируемые потоки; подписные и пиратские источники исключены.
`;
fs.writeFileSync(path.join(OUT, 'AURA-IPTV-World-Summary.md'), md);

console.log(JSON.stringify({
  channels: nCh, countries: nCo, categories: nCat, withLogo, withBackup,
  files: ['AURA-IPTV-World-Report.html', 'AURA-IPTV-World-Channels.csv', 'AURA-IPTV-World.m3u', 'AURA-IPTV-World-Summary.md']
}, null, 2));
