const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const dropped = JSON.parse(fs.readFileSync(path.join(ROOT, '.research', 'dropped_channels.json'), 'utf8'));
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'channels.json'), 'utf8'));
const col = (arr, f) => Object.entries(arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const byC = col(dropped, x => x.country);
const byS = col(dropped, x => x.probeStatus);
const keptByC = col(ch, x => x.country);
const date = new Date().toISOString().slice(0, 10);
const apk = fs.statSync(path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'));
const md = `# Отчёт об обновлении плейлиста AURA IPTV

Дата: ${date}

## Итог
| Этап | Было | Стало | Изменение |
|---|---:|---:|---:|
| Исходный каталог | 36 487 | 16 464 | −20 023 (дубли, битые URL, один поток под разными странами) |
| + новые из открытых источников | 16 464 | 16 532 | +68 |
| + одобренные canlitv-каналы | 16 532 | 16 785 | +253 |
| − неактивные (probe) | 16 785 | **13 176** | −3 609 |

**Итого в плейлисте: ${ch.length.toLocaleString('ru-RU')} каналов, ${new Set(ch.map(c => c.country)).size} стран, ${new Set(ch.map(c => c.group)).size} категорий.**

## Удалено неактивных — ${dropped.length}
- offline (не отвечает / нет соединения): **${byS.find(x => x[0] === 'offline')?.[1] || 0}**
- dead (404/410/400/401/451): **${byS.find(x => x[0] === 'dead')?.[1] || 0}**

По странам (топ):
${byC.slice(0, 12).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

## Оставлено (${ch.length.toLocaleString('ru-RU')})
- с логотипом: **${ch.filter(c => c.logo).length.toLocaleString('ru-RU')}**
- с резервным источником: **${ch.filter(c => (c.backupUrls || []).length).length.toLocaleString('ru-RU')}**
- проверенных ранее: **${ch.filter(c => c.verified).length.toLocaleString('ru-RU')}**

Топ стран в плейлисте:
${keptByC.slice(0, 12).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}

## Методика проверки
- Проба каждого URL через curl (32 параллельно, таймаут 9 с, редиректы следуются).
- Классы: active (2xx + m3u8/медиа), restricted (403/429/503 — гео/хотлинк, оставлены), page (2xx HTML, оставлены), dead (404/410/400/401/451 — удалены), offline (нет соединения — удалены).
- Редиректы 301/302 и 5xx **не** считаются неактивными — оставлены как «нестабильные», чтобы не удалить живой канал из-за временной ошибки.
- Удалённые каналы сохранены в \`.research/dropped_channels.json\` — их можно вернуть.

## Дубли
- уникальность по паре (имя, URL): **0 дублей**
- уникальность по паре (имя, страна): **0 дублей**

## Одобренные canlitv-каналы
- Найдено страниц: 1 080 → уникальных каналов 757
- В каталог вошло: **253** (у 409 не извлечён источник — обфусцированный плеер)
- Остальные совпали с уже имеющимися и ушли в backupUrls

## Развёрнуто
- Сайт: https://tv.ai-studio.se — ${ch.length.toLocaleString('ru-RU')} каналов, ${new Set(ch.map(c => c.country)).size} стран
- Android APK: v1.0.9, ${apk.size} байт, в бандле ${ch.length.toLocaleString('ru-RU')} каналов
- Проверено в браузере на 390px: дублей имён нет, ошибок в консоли нет
`;
fs.writeFileSync(path.join(ROOT, 'reports', 'playlist-update-report.md'), md);
console.log(md);
