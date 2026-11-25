// ============================================================
// Phase 3 — turn the scraped canlitv* data into an import-ready,
// deduplicated, country-sorted pending list (NOT added automatically).
//   reports/canlitv-pending-import.json
//   reports/canlitv-pending-import.csv
//   reports/canlitv-report.md
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RESEARCH = path.join(ROOT, '.research');
const OUT = path.join(ROOT, 'reports');
const ORDER = { '4320p': 0, '2160p': 1, '1440p': 2, '1080p': 3, '720p': 4, '576p': 5, '480p': 6, '360p': 7, '240p': 8, '144p': 9, 'SD': 10, 'Unknown': 11 };

const data = JSON.parse(fs.readFileSync(path.join(RESEARCH, 'canlitv_channels.json'), 'utf8'));
const rows = data.channels;

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 60) || 'ch';
const key = s => String(s).toLowerCase().replace(/[^a-z0-9çğıöşü]+/g, ' ').replace(/\s+/g, ' ').trim();

const GROUP_MAP = [
  [/haber|news/i, 'News'], [/spor|sports/i, 'Sports'], [/m[üu]zik|music/i, 'Music'],
  [/cocuk|kids/i, 'Kids'], [/belgesel|document/i, 'Documentary'], [/dini|religious/i, 'Religious'],
  [/sinema|movies/i, 'Movies'], [/eğitim|education/i, 'Education'],
  [/kurtce|genel|yerel|ulusal|kapanan|deg[ıi]r|azeri|france|germany|k[ıi]br[ıi]s|turkmenistan|abd|suudi|yunan/i, 'General']
];
const groupOf = cat => { for (const [re, g] of GROUP_MAP) if (re.test(cat || '')) return g; return 'General'; };

const OFFICIAL = /(atv\.com\.tr|tabii\.com|tv8\.com\.tr|nowtv\.com\.tr|dreamturk\.com\.tr|tjk\.org|dailymotion|twitch\.tv|kuzeykibris|powerapp\.com\.tr|tv\.online\.tm|artidijitalmedya|yayin\.com\.tr|mediatriple|taksimbilisim|ercdn|showtv|kanald|trt|ntv|hurriyet|milliyet)/i;
const GREY = /(tv\.vin|href\.li|raidrush|canlitv\.|ecanlitvizle|canlitvizle|alfastreamtv|canlitv\.day|liveartidijital)/i;

const score = r => {
  if (!r.sourceUrl) return -1000;
  const host = (r.sourceUrl.match(/^https?:\/\/([^/]+)/) || [])[1] || '';
  let s = r.sourceKind === 'm3u8' ? 100 : 40;
  if (OFFICIAL.test(host)) s += 60;
  if (GREY.test(host)) s -= 40;
  return s;
};

// --- dedupe by normalised name, keep the best-sourced row ---
const groups = new Map();
for (const r of rows) {
  const k = key(r.name);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const merged = [];
for (const [k, list] of groups) {
  list.sort((a, b) => score(b) - score(a));
  const best = list[0];
  const backups = [...new Set(list.map(x => x.sourceUrl).filter(Boolean))].slice(0, 3);
  merged.push({ ...best, allSources: [...new Set(list.map(x => x.sourceUrl).filter(Boolean))], backups });
}

// --- sort by country then name ---
const countryName = new Map();
try {
  const csv = fs.readFileSync(path.join(ROOT, 'data', 'countries.csv'), 'utf8').split(/\r?\n/).slice(1);
  for (const line of csv) { const p = line.split(','); if (p[1]) countryName.set(p[1].trim().toUpperCase(), p[0].trim()); }
} catch (e) {}
merged.sort((a, b) => (a.country || '').localeCompare(b.country || '') || a.name.localeCompare(b.name));

// --- import-ready records ---
const used = new Set();
const importRecords = merged.map(r => {
  let id = slug(r.name) + '.' + String(r.country || 'tr').toLowerCase();
  let n = 2;
  while (used.has(id)) id = slug(r.name) + '.' + String(r.country || 'tr').toLowerCase() + '.' + (n++);
  used.add(id);
  return {
    id,
    name: r.name,
    logo: '',
    group: groupOf(r.category),
    country: r.country,
    language: 'Turkish',
    url: r.sourceUrl || '',
    tvgId: '',
    resolution: 'Unknown',
    qualityOrder: 99,
    backupUrls: r.backups && r.backups[0] ? r.backups.slice(1) : [],
    verified: false,
    probe: null,
    sourceSite: r.site,
    sourceKind: r.sourceKind,
    channelUrl: r.channelUrl
  };
});

fs.writeFileSync(path.join(OUT, 'canlitv-pending-import.json'), JSON.stringify({
  generated: new Date().toISOString(),
  status: 'PENDING_APPROVAL',
  note: 'Not added to the catalog. Import only after review/approval.',
  count: importRecords.length,
  channels: importRecords
}, null, 2));

const csvHead = 'country_code,country,channel,category,source_kind,source_url,backup_urls,site,channel_page\n';
const csv = importRecords.map(r => [
  r.country, countryName.get(r.country) || r.country, r.name, r.group, r.sourceKind, r.url,
  (r.backupUrls || []).join(' | '), r.sourceSite, r.channelUrl
].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
fs.writeFileSync(path.join(OUT, 'canlitv-pending-import.csv'), csvHead + csv + '\n');

// --- report ---
const bySite = {};
const byCountry = {};
const byKind = {};
const hosts = {};
for (const r of merged) {
  bySite[r.site] = (bySite[r.site] || 0) + 1;
  byCountry[r.country] = (byCountry[r.country] || 0) + 1;
  byKind[r.sourceKind] = (byKind[r.sourceKind] || 0) + 1;
  const h = r.sourceUrl ? (r.sourceUrl.match(/^https?:\/\/([^/]+)/) || [])[1] || '?' : '(нет источника)';
  hosts[h] = (hosts[h] || 0) + 1;
}
const md = `# Canlitv-источники — анализ и список к добавлению (на одобрении)

Дата: ${new Date().toISOString().slice(0, 10)} · Статус: **НЕ ДОБАВЛЕНО** в каталог, ждёт одобрения.

## Итог
- Страниц каналов найдено: **${data.totals.channelPages}** (canlitv.me ${data.sites['canlitv.me']}, ecanlitvizle.live ${data.sites['ecanlitvizle.live']}, canlitv.com ${data.sites['canlitv.com']})
- Страниц успешно разобрано: **${data.totals.pagesOk}** (не удалось: ${data.totals.channelPages - data.totals.pagesOk})
- Каналов с плеером: **${data.totals.withPlayer}**
- После дедупликации по названию: **${merged.length}** каналов (было строк ${rows.length})
- Из них с готовым источником: **${byKind.m3u8 + (byKind.page || 0)}** (прямой m3u8: ${byKind.m3u8 || 0}, страница вещателя: ${byKind.page || 0})
- Без извлечённого источника: **${byKind.none || 0}** — у них остался только адрес плеера источника

## По сайтам (после дедупликации)
${Object.entries(bySite).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

## По странам
${Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + (countryName.get(k) || k) + ' (' + k + '): ' + v).join('\n')}

## По типу источника
${Object.entries(byKind).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

## Топ домены источников
${Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

## Что важно знать перед добавлением
1. Часть источников — официальные страницы вещателей (atv.com.tr, tabii.com/trt, tv8.com.tr, nowtv.com.tr, dreamturk.com.tr, tjk.org, dailymotion, twitch). Это легально и бесплатно, но таких ссылок мало.
2. Заметная часть — прокси/агрегаторы потоков (tv.vin, canlitv.fun, href.li и подобщие). Они неофициальные, часто гео-зависимы и нестабильны; правовой статус у них сомнительный.
3. Прямые m3u8 найдены у ${byKind.m3u8 || 0} каналов — их можно играть напрямую.
4. Почти все каналы — турецкие (TR), есть AZ, DE, FR, US, CY.
5. Список подготовлен в формате нашего каталога, но **не импортирован**.

## Файлы
- \`canlitv-pending-import.json\` — готовые записи каталога (id, name, group, country, url, backupUrls…).
- \`canlitv-pending-import.csv\` — тот же список для просмотра/правки.
- \`canlitv-report.md\` — этот отчёт.
`;
fs.writeFileSync(path.join(OUT, 'canlitv-report.md'), md);

console.log(JSON.stringify({
  rawRows: rows.length, unique: merged.length,
  bySite, byCountry, byKind,
  topHosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 8)
}, null, 2));
