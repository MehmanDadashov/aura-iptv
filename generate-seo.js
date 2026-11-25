#!/usr/bin/env node
/**
 * AURA IPTV — SEO Landing Page Generator
 * Creates country/category landing pages, sitemap.xml, robots.txt
 * for passive organic traffic on Firebase Hosting.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'public/seo');
const BASE_URL = 'https://tv.ai-studio.se';

// Load data
const countries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'countries.json'), 'utf8')).countries;
const categories = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'categories.json'), 'utf8')).categories;
const channels = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'channels.json'), 'utf8'));

// Helpers
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getCountryName(code) {
  const c = countries.find(x => x.code === code);
  return c ? c.name : code;
}

function getCategoryName(name) {
  const c = categories.find(x => x.name === name);
  return c ? c.name : name;
}

// Load channel data once for counting
function countChannelsByCountry(countryCode) {
  return channels.filter(ch => ch.country === countryCode && ch.verified).length;
}

function countChannelsByCategory(categoryName) {
  return channels.filter(ch => ch.group === categoryName && ch.verified).length;
}

function getTopChannelsByCountry(countryCode, limit = 12) {
  return channels
    .filter(ch => ch.country === countryCode && ch.verified)
    .slice(0, limit)
    .map(ch => ({
      name: ch.name,
      logo: ch.logo,
      url: ch.url,
      group: ch.group,
      resolution: ch.resolution
    }));
}

function getTopChannelsByCategory(categoryName, limit = 12) {
  return channels
    .filter(ch => ch.group === categoryName && ch.verified)
    .slice(0, limit)
    .map(ch => ({
      name: ch.name,
      logo: ch.logo,
      url: ch.url,
      country: ch.country,
      resolution: ch.resolution
    }));
}

// JSON-LD structured data
function jsonLdCountry(countryCode, countryName, count, topChannels) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${countryName} Live TV Channels — AURA IPTV`,
    'description': `Watch ${count} free live TV channels from ${countryName}. News, sports, entertainment, movies — no registration, no subscription.`,
    'url': `${BASE_URL}/seo/country/${slugify(countryCode)}.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': count,
      'itemListElement': topChannels.map((ch, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'TelevisionChannel',
          'name': ch.name,
          'genre': ch.group,
          'broadcastDisplayName': ch.name,
          'broadcastAffiliateOf': {
            '@type': 'Organization',
            'name': 'AURA IPTV'
          },
          'broadcastFrequency': {
            '@type': 'BroadcastFrequencySpecification',
            'broadcastFrequencyValue': ch.url,
            'broadcastSignalModulation': 'HLS'
          },
          'video': {
            '@type': 'VideoObject',
            'name': ch.name,
            'thumbnailUrl': ch.logo,
            'contentUrl': ch.url,
            'encodingFormat': 'application/vnd.apple.mpegurl'
          }
        }
      }))
    },
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${BASE_URL}/seo/country/${slugify(countryCode)}.html?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
}

function jsonLdCategory(categoryName, count, topChannels) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${categoryName} TV Channels — AURA IPTV`,
    'description': `Browse ${count} free ${categoryName.toLowerCase()} TV channels from around the world. Live streaming, no registration required.`,
    'url': `${BASE_URL}/seo/category/${slugify(categoryName)}.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': count,
      'itemListElement': topChannels.map((ch, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'TelevisionChannel',
          'name': ch.name,
          'genre': categoryName,
          'broadcastDisplayName': ch.name,
          'broadcastAffiliateOf': {
            '@type': 'Organization',
            'name': 'AURA IPTV'
          },
          'broadcastFrequency': {
            '@type': 'BroadcastFrequencySpecification',
            'broadcastFrequencyValue': ch.url,
            'broadcastSignalModulation': 'HLS'
          },
          'video': {
            '@type': 'VideoObject',
            'name': ch.name,
            'thumbnailUrl': ch.logo,
            'contentUrl': ch.url,
            'encodingFormat': 'application/vnd.apple.mpegurl'
          }
        }
      }))
    }
  };
}

// HTML template for landing pages
function landingPageHtml({ title, description, jsonLd, canonical, h1, lead, channels, breadcrumbs, backLink }) {
  const chHtml = channels.map(ch => `
    <article class="seo-card" itemscope itemtype="https://schema.org/TelevisionChannel">
      ${ch.logo ? `<img itemprop="image" src="${ch.logo}" alt="${ch.name} logo" loading="lazy" class="seo-card-logo">` : ''}
      <div class="seo-card-body">
        <h3 itemprop="name">${ch.name}</h3>
        <p class="seo-card-meta">
          ${ch.group ? `<span itemprop="genre">${ch.group}</span>` : ''}
          ${ch.country ? `<span>${ch.country}</span>` : ''}
          ${ch.resolution ? `<span>${ch.resolution}</span>` : ''}
        </p>
        <a href="${BASE_URL}/player.html?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}" class="btn-primary btn-sm" itemprop="url">Watch</a>
      </div>
    </article>
  `).join('');

  const breadcrumbHtml = breadcrumbs.map((b, i) =>
    i === breadcrumbs.length - 1
      ? `<span aria-current="page">${b.label}</span>`
      : `<a href="${b.url}">${b.label}</a>`
  ).join(' <span class="breadcrumb-sep">/</span> ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${BASE_URL}/icon.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${BASE_URL}/icon.png">
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#07080f;--bg-2:#0b0d18;--surface:rgba(255,255,255,.045);--text:#f2f4fb;--text-2:#9aa3b8;--accent:#7c5cff;--border:rgba(255,255,255,.09);--radius:16px;--shadow:0 12px 40px rgba(0,0,0,.45)}
    *{box-sizing:border-box}body{margin:0;font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
    .wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
    header{margin-bottom:24px}
    .breadcrumb{font-size:13px;color:var(--text-2);margin-bottom:16px}
    .breadcrumb a{color:var(--text-2);text-decoration:none}.breadcrumb a:hover{color:var(--accent)}
    .breadcrumb-sep{margin:0 6px}
    h1{font-size:28px;font-weight:800;margin:0 0 8px;background:linear-gradient(120deg,#22d3ee 0%,#7c5cff 55%,#f472b6 110%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .lead{color:var(--text-2);font-size:16px;margin:0 0 24px;max-width:700px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .seo-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;gap:12px;transition:border-color .15s,transform .15s}
    .seo-card:hover{border-color:var(--accent);transform:translateY(-2px)}
    .seo-card-logo{width:64px;height:36px;object-fit:contain;border-radius:8px;flex-shrink:0}
    .seo-card-body{flex:1;min-width:0}
    .seo-card-body h3{margin:0 0 6px;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .seo-card-meta{margin:0 0 10px;font-size:12px;color:var(--text-2);display:flex;flex-wrap:wrap;gap:8px}
    .seo-card-meta span{background:var(--surface);padding:2px 8px;border-radius:999px}
    .btn-primary{display:inline-block;background:linear-gradient(120deg,#22d3ee 0%,#7c5cff 55%,#f472b6 110%);color:#07080f;font-weight:700;padding:10px 16px;border-radius:10px;text-decoration:none;font-size:13px;transition:filter .15s,transform .15s}
    .btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
    .btn-sm{padding:8px 14px;font-size:12px}
    .back-link{display:inline-flex;align-items:center;gap:6px;margin-top:24px;color:var(--text-2);text-decoration:none;font-size:14px}
    .back-link:hover{color:var(--accent)}
    @media (max-width:600px){.seo-card{flex-direction:column;align-items:flex-start}.seo-card-logo{width:100%;height:auto;max-height:180px}}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
      <h1>${h1}</h1>
      <p class="lead">${lead}</p>
    </header>
    <main>
      ${channels.length ? `<div class="grid" role="list">${chHtml}</div>` : '<p>No verified channels found.</p>'}
    </main>
    <footer>
      <a class="back-link" href="${backLink}">← Back to AURA IPTV</a>
    </footer>
  </div>
</body>
</html>`;
}

// Generate country pages
function generateCountryPages() {
  console.log('Generating country pages...');
  const countryDir = path.join(OUT_DIR, 'country');
  fs.mkdirSync(countryDir, { recursive: true });

  const urls = [];

  countries.forEach(c => {
    const code = c.code;
    const name = c.name;
    const count = countChannelsByCountry(code);
    if (count === 0) return;

    const top = getTopChannelsByCountry(code);
    const slug = slugify(code);
    const canonical = `${BASE_URL}/seo/country/${slug}.html`;

    const ld = jsonLdCountry(code, name, count, top);
    const html = landingPageHtml({
      title: `${name} Live TV Channels — AURA IPTV`,
      description: `Watch ${count} free live TV channels from ${name}. News, sports, entertainment, movies — no registration, no subscription.`,
      jsonLd: ld,
      canonical,
      h1: `${name} Live TV`,
      lead: `${count} verified free channels from ${name}. Click any channel to watch instantly in your browser — no app required.`,
      channels: top,
      breadcrumbs: [
        { label: 'AURA IPTV', url: BASE_URL },
        { label: 'Countries', url: `${BASE_URL}/seo/countries.html` },
        { label: name, url: canonical }
      ],
      backLink: BASE_URL
    });

    fs.writeFileSync(path.join(countryDir, `${slug}.html`), html);
    urls.push(canonical);
    console.log(`  ${slug}.html — ${count} channels`);
  });

  // Countries index
  const countriesIndexHtml = landingPageHtml({
    title: 'TV Channels by Country — AURA IPTV',
    description: 'Browse free live TV channels from 180+ countries. News, sports, movies, entertainment — all free, no registration.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': 'TV Channels by Country',
      'description': 'Browse free live TV channels from 180+ countries.',
      'url': `${BASE_URL}/seo/countries.html`,
      'mainEntity': {
        '@type': 'ItemList',
        'itemListElement': countries.map((c, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'item': {
            '@type': 'WebPage',
            'name': `${c.name} (${c.count} channels)`,
            'url': `${BASE_URL}/seo/country/${slugify(c.code)}.html`
          }
        }))
      }
    },
    canonical: `${BASE_URL}/seo/countries.html`,
    h1: 'TV Channels by Country',
    lead: `${countries.length} countries, ${countries.reduce((s, c) => s + c.count, 0)} total channels. Select a country to browse its live TV channels.`,
    channels: countries.slice(0, 50).map(c => ({
      name: `${c.name} (${c.count} channels)`,
      logo: '',
      url: `${BASE_URL}/seo/country/${slugify(c.code)}.html`,
      group: '',
      resolution: ''
    })),
    breadcrumbs: [
      { label: 'AURA IPTV', url: BASE_URL },
      { label: 'Countries', url: `${BASE_URL}/seo/countries.html` }
    ],
    backLink: BASE_URL
  });

  fs.writeFileSync(path.join(OUT_DIR, 'countries.html'), countriesIndexHtml);
  urls.push(`${BASE_URL}/seo/countries.html`);
  console.log(`  countries.html — index page`);

  return urls;
}

// Generate category pages
function generateCategoryPages() {
  console.log('Generating category pages...');
  const catDir = path.join(OUT_DIR, 'category');
  fs.mkdirSync(catDir, { recursive: true });

  const urls = [];

  categories.forEach(c => {
    const name = c.name;
    const count = countChannelsByCategory(name);
    if (count === 0) return;

    const top = getTopChannelsByCategory(name);
    const slug = slugify(name);
    const canonical = `${BASE_URL}/seo/category/${slug}.html`;

    const ld = jsonLdCategory(name, count, top);
    const html = landingPageHtml({
      title: `${name} TV Channels — AURA IPTV`,
      description: `Browse ${count} free ${name.toLowerCase()} TV channels from around the world. Live streaming, no registration required.`,
      jsonLd: ld,
      canonical,
      h1: `${name} TV Channels`,
      lead: `${count} verified free ${name.toLowerCase()} channels. Click any channel to watch instantly.`,
      channels: top,
      breadcrumbs: [
        { label: 'AURA IPTV', url: BASE_URL },
        { label: 'Categories', url: `${BASE_URL}/seo/categories.html` },
        { label: name, url: canonical }
      ],
      backLink: BASE_URL
    });

    fs.writeFileSync(path.join(catDir, `${slug}.html`), html);
    urls.push(canonical);
    console.log(`  ${slug}.html — ${count} channels`);
  });

  // Categories index
  const catsIndexHtml = landingPageHtml({
    title: 'TV Channels by Category — AURA IPTV',
    description: 'Browse free live TV channels by genre: News, Sports, Movies, Music, Kids, Documentaries and more.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': 'TV Channels by Category',
      'description': 'Browse free live TV channels by genre.',
      'url': `${BASE_URL}/seo/categories.html`,
      'mainEntity': {
        '@type': 'ItemList',
        'itemListElement': categories.map((c, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'item': {
            '@type': 'WebPage',
            'name': `${c.name} (${c.count} channels)`,
            'url': `${BASE_URL}/seo/category/${slugify(c.name)}.html`
          }
        }))
      }
    },
    canonical: `${BASE_URL}/seo/categories.html`,
    h1: 'TV Channels by Category',
    lead: `${categories.length} categories, ${categories.reduce((s, c) => s + c.count, 0)} total channels. Select a genre to browse.`,
    channels: categories.map(c => ({
      name: `${c.name} (${c.count} channels)`,
      logo: '',
      url: `${BASE_URL}/seo/category/${slugify(c.name)}.html`,
      group: '',
      resolution: ''
    })),
    breadcrumbs: [
      { label: 'AURA IPTV', url: BASE_URL },
      { label: 'Categories', url: `${BASE_URL}/seo/categories.html` }
    ],
    backLink: BASE_URL
  });

  fs.writeFileSync(path.join(OUT_DIR, 'categories.html'), catsIndexHtml);
  urls.push(`${BASE_URL}/seo/categories.html`);
  console.log(`  categories.html — index page`);

  return urls;
}

// Generate sitemap.xml
function generateSitemap(allUrls) {
  console.log('Generating sitemap.xml...');
  const today = new Date().toISOString().split('T')[0];
  const staticUrls = [
    `${BASE_URL}/`,
    `${BASE_URL}/download.html`,
    `${BASE_URL}/seo/countries.html`,
    `${BASE_URL}/seo/categories.html`
  ];

  const all = [...new Set([...staticUrls, ...allUrls])].sort();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${all.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url === BASE_URL + '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml);
  console.log(`  sitemap.xml — ${all.length} URLs`);
}

// Generate robots.txt
function generateRobots() {
  console.log('Generating robots.txt...');
  const txt = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/seo/sitemap.xml

# AURA IPTV — Free live TV player
# No private areas to disallow
`;
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), txt);
  console.log(`  robots.txt`);
}

// Main
function main() {
  console.log('=== AURA SEO Generator ===');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const countryUrls = generateCountryPages();
  const categoryUrls = generateCategoryPages();
  const allUrls = [...countryUrls, ...categoryUrls];

  generateSitemap(allUrls);
  generateRobots();

  console.log('=== Done ===');
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Pages: ${allUrls.length + 4} (countries + categories + indexes)`);
}

main();