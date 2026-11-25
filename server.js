const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Disable TLS certificate verification for IPTV streams with mismatched certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const PID_FILE = path.join(DATA_DIR, 'server.pid');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- HLS manifest helpers ----------
// A manifest is only a manifest if the content-type says so or the body starts
// with #EXTM3U. Anything else (geo-block page, login page, error HTML) is passed
// through untouched instead of being rewritten into a broken "manifest".
function looksLikeManifest(contentType, body) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('mpegurl')) return true;
  return String(body).slice(0, 4096).trimStart().startsWith('#EXTM3U');
}

// Rewrite every variant/segment URI to our same-origin proxy. Relative URIs are
// resolved against the manifest's own URL — otherwise HLS.js requests
// "/api/stream-proxy?url=chunklist.m3u8" and the proxy cannot resolve it.
function rewriteManifest(body, baseUrl) {
  return String(body).split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    // Tag lines carry URIs too (e.g. #EXT-X-MEDIA:...URI="audio.m3u8") — rewrite those.
    if (trimmed.startsWith('#')) {
      if (!/URI="([^"]+)"/.test(trimmed)) return line;
      return line.replace(/URI="([^"]+)"/, (m, u) => {
        try { return 'URI="' + '/api/stream-proxy?url=' + encodeURIComponent(new URL(u, baseUrl).href) + '"'; }
        catch (e) { return m; }
      });
    }
    let abs;
    try { abs = new URL(trimmed, baseUrl).href; } catch (e) { return line; }
    return '/api/stream-proxy?url=' + encodeURIComponent(abs);
  }).join('\n');
}


// Check if another instance is running
if (fs.existsSync(PID_FILE)) {
  try {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (oldPid && !Number.isNaN(oldPid)) {
      try {
        process.kill(oldPid, 0);
        console.log(`Another instance is running (PID ${oldPid}), skipping startup.`);
        process.exit(0);
      } catch (e) {
        // Old process not running, continue
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch (e) {
    // Ignore and continue
  }
}

// Write PID file for safe shutdown
try {
  fs.writeFileSync(PID_FILE, String(process.pid));
} catch (e) {
  console.warn('Failed to write PID file:', e);
}

// Graceful shutdown
function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    try { fs.unlinkSync(PID_FILE); } catch (e) {}
    process.exit(0);
  });
  setTimeout(() => {
    console.log('Forced shutdown after timeout');
    try { fs.unlinkSync(PID_FILE); } catch (e) {}
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Load channels
function loadChannels() {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
      // Support both array format and object format {"channels": [...], "total": N}
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.channels)) return data.channels;
    }
  } catch (e) {
    console.error('Error loading channels:', e);
  }
  return [];
}

function saveChannels(channels) {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
}

function getCountryFlag(code) {
  const flags = {
    'United States': '🇺🇸', 'US': '🇺🇸', 'India': '🇮🇳', 'IN': '🇮🇳',
    'Russia': '🇷🇺', 'RU': '🇷🇺', 'International': '🌍', 'Brazil': '🇧🇷',
    'BR': '🇧🇷', 'Italy': '🇮🇹', 'IT': '🇮🇹', 'Spain': '🇪🇸',
    'ES': '🇪🇸', 'Dominican Republic': '🇩🇴', 'DO': '🇩🇴', 'Canada': '🇨🇦',
    'CA': '🇨🇦', 'Chile': '🇨🇱', 'CL': '🇨🇱', 'United Kingdom': '🇬🇧',
    'GB': '🇬🇧', 'Argentina': '🇦🇷', 'AR': '🇦🇷', 'Germany': '🇩🇪',
    'DE': '🇩🇪', 'France': '🇫🇷', 'FR': '🇫🇷', 'Poland': '🇵🇱',
    'PL': '🇵🇱', 'Iran': '🇮🇷', 'IR': '🇮🇷', 'Ukraine': '🇺🇦',
    'UA': '🇺🇦', 'Romania': '🇷🇴', 'RO': '🇷🇴', 'Indonesia': '🇮🇩',
    'ID': '🇮🇩', 'Turkiye': '🇹🇷', 'TR': '🇹🇷', 'Turkey': '🇹🇷',
    'Peru': '🇵🇪', 'PE': '🇵🇪', 'Mexico': '🇲🇽', 'MX': '🇲🇽',
    'Netherlands': '🇳🇱', 'NL': '🇳🇱', 'Hungary': '🇭🇺', 'HU': '🇭🇺',
    'Denmark': '🇩🇰', 'DK': '🇩🇰', 'China': '🇨🇳', 'CN': '🇨🇳',
    'Sweden': '🇸🇪', 'SE': '🇸🇪', 'Colombia': '🇨🇴', 'CO': '🇨🇴',
    'Norway': '🇳🇴', 'NO': '🇳🇴', 'Austria': '🇦🇹', 'AT': '🇦🇹',
    'Pakistan': '🇵🇰', 'PK': '🇵🇰', 'Czech Republic': '🇨🇿',
    'CZ': '🇨🇿', 'Bolivia': '🇧🇴', 'BO': '🇧🇴', 'Ecuador': '🇪🇨',
    'EC': '🇪🇨', 'Vietnam': '🇻🇳', 'VN': '🇻🇳', 'Honduras': '🇭🇳',
    'HN': '🇭🇳', 'Australia': '🇦🇺', 'AU': '🇦🇺', 'Bulgaria': '🇧🇬',
    'BG': '🇧🇬', 'Greece': '🇬🇷', 'GR': '🇬🇷', 'South Korea': '🇰🇷',
    'KR': '🇰🇷', 'Thailand': '🇹🇭', 'TH': '🇹🇭', 'Venezuela': '🇻🇪',
    'VE': '🇻🇪', 'Costa Rica': '🇨🇷', 'CR': '🇨🇷', 'Guatemala': '🇬🇹',
    'GT': '🇬🇹', 'Paraguay': '🇵🇾', 'PY': '🇵🇾', 'Iraq': '🇮🇶',
    'IQ': '🇮🇶', 'Portugal': '🇵🇹', 'PT': '🇵🇹', 'Ireland': '🇮🇪',
    'IE': '🇮🇪', 'Slovakia': '🇸🇰', 'SK': '🇸🇰', 'Nigeria': '🇳🇬',
    'NG': '🇳🇬', 'Saudi Arabia': '🇸🇦', 'SA': '🇸🇦', 'Belgium': '🇧🇪',
    'BE': '🇧🇪', 'Kazakhstan': '🇰🇿', 'KZ': '🇰🇿', 'Serbia': '🇷🇸',
    'RS': '🇷🇸', 'Bangladesh': '🇧🇩', 'BD': '🇧🇩', 'El Salvador': '🇸🇻',
    'SV': '🇸🇻', 'Kenya': '🇰🇪', 'KE': '🇰🇪', 'Mongolia': '🇲🇳',
    'MN': '🇲🇳', 'Israel': '🇮🇱', 'IL': '🇮🇱', 'Uzbekistan': '🇺🇿',
    'UZ': '🇺🇿', 'Lebanon': '🇱🇧', 'LB': '🇱🇧', 'Taiwan': '🇹🇼',
    'TW': '🇹🇼', 'Puerto Rico': '🇵🇷', 'PR': '🇵🇷', 'North Macedonia': '🇲🇰',
    'MK': '🇲🇰', 'Switzerland': '🇨🇭', 'CH': '🇨🇭', 'Belarus': '🇧🇾',
    'BY': '🇧🇾', 'Croatia': '🇭🇷', 'HR': '🇭🇷', 'Cambodia': '🇰🇭',
    'KH': '🇰🇭', 'Haiti': '🇭🇹', 'HT': '🇭🇹', 'Afghanistan': '🇦🇫',
    'AF': '🇦🇫', 'Estonia': '🇪🇪', 'EE': '🇪🇪', 'Finland': '🇫🇮',
    'FI': '🇫🇮', 'Moldova': '🇲🇩', 'MD': '🇲🇩', 'Panama': '🇵🇦',
    'PA': '🇵🇦', 'Albania': '🇦🇱', 'AL': '🇦🇱', 'Georgia': '🇬🇪',
    'GE': '🇬🇪', 'Uganda': '🇺🇬', 'UG': '🇺🇬', 'Bosnia and Herzegovina': '🇧🇦',
    'BA': '🇧🇦', 'Egypt': '🇪🇬', 'EG': '🇪🇬', 'Slovenia': '🇸🇮',
    'SI': '🇸🇮', 'United Arab Emirates': '🇦🇪', 'AE': '🇦🇪', 'Azerbaijan': '🇦🇿',
    'AZ': '🇦🇿', 'Ivory Coast': '🇨🇮', 'CI': '🇨🇮', 'Jordan': '🇯🇴',
    'JO': '🇯🇴', 'Lithuania': '🇱🇹', 'LT': '🇱🇹', 'Nicaragua': '🇳🇮',
    'NI': '🇳🇮', 'Palestine': '🇵🇸', 'PS': '🇵🇸', 'South Africa': '🇿🇦',
    'ZA': '🇿🇦', 'Malaysia': '🇲🇾', 'MY': '🇲🇾', 'Cameroon': '🇨🇲',
    'CM': '🇨🇲', 'Cyprus': '🇨🇾', 'CY': '🇨🇾', 'Democratic Republic of the Congo': '🇨🇩',
    'CD': '🇨🇩', 'Hong Kong': '🇭🇰', 'HK': '🇭🇰', 'Myanmar': '🇲🇲',
    'MM': '🇲🇲', 'Sri Lanka': '🇱🇰', 'LK': '🇱🇰', 'Philippines': '🇵🇭',
    'PH': '🇵🇭', 'Nepal': '🇳🇵', 'NP': '🇳🇵', 'Senegal': '🇸🇳',
    'SN': '🇸🇳', 'Tajikistan': '🇹🇯', 'TJ': '🇹🇯', 'Aruba': '🇦🇼',
    'AW': '🇦🇼', 'Latvia': '🇱🇻', 'LV': '🇱🇻', 'Ghana': '🇬🇭',
    'GH': '🇬🇭', 'Kosovo': '🇽🇰', 'XK': '🇽🇰', 'Kuwait': '🇰🇼',
    'KW': '🇰🇼', 'Luxembourg': '🇱🇺', 'LU': '🇱🇺', 'Togo': '🇹🇬',
    'TG': '🇹🇬', 'Laos': '🇱🇦', 'LA': '🇱🇦', 'Maldives': '🇲🇻',
    'MV': '🇲🇻', 'Morocco': '🇲🇦', 'MA': '🇲🇦', 'Syria': '🇸🇾',
    'SY': '🇸🇾', 'Armenia': '🇦🇲', 'AM': '🇦🇲', 'Benin': '🇧🇯',
    'BJ': '🇧🇯', 'Japan': '🇯🇵', 'JP': '🇯🇵', 'New Zealand': '🇳🇿',
    'NZ': '🇳🇿', 'Qatar': '🇶🇦', 'QA': '🇶🇦', 'Singapore': '🇸🇬',
    'SG': '🇸🇬', 'Algeria': '🇩🇿', 'DZ': '🇩🇿', 'Andorra': '🇦🇩',
    'AD': '🇦🇩', 'Turkmenistan': '🇹🇲', 'TM': '🇹🇲', 'Uruguay': '🇺🇾',
    'UY': '🇺🇾', 'Jamaica': '🇯🇲', 'JM': '🇯🇲', 'Kyrgyzstan': '🇰🇬',
    'KG': '🇰🇬', 'Macao': '🇲🇴', 'MO': '🇲🇴', 'Malta': '🇲🇹',
    'MT': '🇲🇹', 'Montenegro': '🇲🇪', 'ME': '🇲🇪', 'Rwanda': '🇷🇼',
    'RW': '🇷🇼', 'Somalia': '🇸🇴', 'SO': '🇸🇴', 'Tanzania': '🇹🇿',
    'TZ': '🇹🇿', 'Burkina Faso': '🇧🇫', 'BF': '🇧🇫', 'Guyana': '🇬🇾',
    'GY': '🇬🇾', 'Iceland': '🇮🇸', 'IS': '🇮🇸', 'Martinique': '🇲🇶',
    'MQ': '🇲🇶', 'Sint Maarten': '🇸🇽', 'SX': '🇸🇽', 'Trinidad and Tobago': '🇹🇹',
    'TT': '🇹🇹', 'Bonaire': '🇧🇶', 'BQ': '🇧🇶', 'Guadeloupe': '🇬🇵',
    'GP': '🇬🇵', 'Guinea': '🇬🇳', 'GN': '🇬🇳', 'Libya': '🇱🇾',
    'LY': '🇱🇾', 'Mozambique': '🇲🇿', 'MZ': '🇲🇿', 'Niger': '🇳🇪',
    'NE': '🇳🇪', 'Oman': '🇴🇲', 'OM': '🇴🇲', 'Republic of the Congo': '🇨🇬',
    'CG': '🇨🇬', 'Bahamas': '🇧🇸', 'BS': '🇧🇸', 'Bahrain': '🇧🇭',
    'BH': '🇧🇭', 'Brunei': '🇧🇳', 'BN': '🇧🇳', 'Cuba': '🇨🇺',
    'CU': '🇨🇺', 'Curacao': '🇨🇼', 'CW': '🇨🇼', 'Ethiopia': '🇪🇹',
    'ET': '🇪🇹', 'North Korea': '🇰🇵', 'KP': '🇰🇵', 'Yemen': '🇾🇪',
    'YE': '🇾🇪', 'Angola': '🇦🇴', 'AO': '🇦🇴', 'Mali': '🇲🇱',
    'ML': '🇲🇱', 'Saint Kitts and Nevis': '🇰🇳', 'KN': '🇰🇳', 'Sudan': '🇸🇩',
    'SD': '🇸🇩', 'Tunisia': '🇹🇳', 'TN': '🇹🇳', 'Belize': '🇧🇿',
    'BZ': '🇧🇿', 'British Virgin Islands': '🇻🇬', 'VG': '🇻🇬', 'Burundi': '🇧🇮',
    'BI': '🇧🇮', 'Equatorial Guinea': '🇬🇶', 'GQ': '🇬🇶', 'Namibia': '🇳🇦',
    'NA': '🇳🇦', 'Saint Lucia': '🇱🇨', 'LC': '🇱🇨', 'Suriname': '🇸🇷',
    'SR': '🇸🇷', 'Antigua and Barbuda': '🇦🇬', 'AG': '🇦🇬', 'Barbados': '🇧🇧',
    'BB': '🇧🇧', 'Cape Verde': '🇨🇻', 'CV': '🇨🇻', 'Chad': '🇹🇩',
    'TD': '🇹🇩', 'Comoros': '🇰🇲', 'KM': '🇰🇲', 'Eritrea': '🇪🇷',
    'ER': '🇪🇷', 'French Guiana': '🇬🇫', 'GF': '🇬🇫', 'French Polynesia': '🇵🇫',
    'PF': '🇵🇫', 'Gambia': '🇬🇲', 'GM': '🇬🇲', 'Guam': '🇬🇺',
    'GU': '🇬🇺', 'Guernsey': '🇬🇬', 'GG': '🇬🇬', 'Mauritania': '🇲🇷',
    'MR': '🇲🇷', 'Monaco': '🇲🇨', 'MC': '🇲🇨', 'New Caledonia': '🇳🇨',
    'NC': '🇳🇨', 'Papua New Guinea': '🇵🇬', 'PG': '🇵🇬', 'Saint Vincent and the Grenadines': '🇻🇨',
    'VC': '🇻🇨', 'Samoa': '🇼🇸', 'WS': '🇼🇸', 'Sierra Leone': '🇸🇱',
    'SL': '🇸🇱', 'Western Sahara': '🇪🇭', 'EH': '🇪🇭', 'Zimbabwe': '🇿🇼',
    'ZW': '🇿🇼'
  };
  return flags[code] || '🌍';
}

// Load M3U playlist
function parseM3U(text) {
  const lines = text.split('\n');
  const channels = [];
  let current = null;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF:')) {
      const name = t.split(',').pop()?.trim() || 'Unknown Channel';
      const logoMatch = t.match(/tvg-logo="([^"]*)"/);
      const groupMatch = t.match(/group-title="([^"]*)"/);
      const countryMatch = t.match(/country="([^"]*)"/);
      
      current = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        name,
        logo: logoMatch?.[1] || '',
        group: groupMatch?.[1] || 'General',
        country: countryMatch?.[1] || 'XX',
        url: '',
        active: true
      };
    } else if (t && current && !t.startsWith('#')) {
      current.url = t;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/channels', (req, res) => {
  const channels = loadChannels();
  const { country, category, language, search, limit = 100, offset = 0 } = req.query;
  
  let filtered = channels;
  
  if (country && country !== 'all') {
    filtered = filtered.filter(ch => ch.country === country);
  }
  
  if (language && language !== 'all') {
    filtered = filtered.filter(ch => ch.language === language);
  }
  
  if (category && category !== 'all') {
    filtered = filtered.filter(ch => {
      const cats = ch.group.split(';').map(g => g.trim());
      return cats.includes(category);
    });
  }
  
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(ch => 
      ch.name.toLowerCase().includes(s) || 
      ch.group.toLowerCase().includes(s)
    );
  }
  
  const total = filtered.length;
  const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  res.json({
    channels: paginated,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
});

app.get('/api/categories', (req, res) => {
  const channels = loadChannels();
  const categoryCounts = {};
  
  channels.forEach(ch => {
    const cats = ch.group.split(';').map(g => g.trim().toLowerCase()).filter(Boolean);
    const primary = cats[0] || 'general';
    categoryCounts[primary] = (categoryCounts[primary] || 0) + 1;
  });
  
  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  
  res.json({ categories });
});

app.get('/api/countries', (req, res) => {
  const channels = loadChannels();
  const countryCounts = {};
  
  channels.forEach(ch => {
    const code = ch.country || 'XX';
    countryCounts[code] = (countryCounts[code] || 0) + 1;
  });
  
  // Load country names from data/countries.json (cached, alphabetically sorted by name)
  let countryNameMap = {};
  try {
    const countriesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/countries.json'), 'utf8'));
    const countriesList = countriesData.countries || countriesData;
    countriesList.forEach(c => { countryNameMap[c.code] = c.name; });
  } catch (e) {
    // Fallback: build names from getCountryFlag's known names
    const known = {};
    for (const key of Object.keys(flags)) {
      if (key.length <= 4 && /^[A-Z]{2,3}$/.test(key)) continue;
      if (key.includes(':')) {
        const parts = key.split(':');
        known[parts[0]] = parts[0];
        if (parts[1]) known[parts[1]] = parts[0];
      }
    }
    countryNameMap = known;
  }
  
  const countries = Object.entries(countryCounts)
    .map(([code, count]) => ({
      code,
      name: countryNameMap[code] || code,
      count,
      flag: getCountryFlag(code)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));  // Alphabetical by name
  
  res.json({ countries });
});

app.get('/api/languages', (req, res) => {
  const channels = loadChannels();
  const languageCounts = {};
  
  channels.forEach(ch => {
    const lang = ch.language || 'Unknown';
    if (lang !== 'Unknown') {
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    }
  });
  
  const languages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  
  res.json({ languages });
});

app.post('/api/import-m3u', (req, res) => {
  try {
    const { url, content } = req.body;
    let m3uContent = content;
    
    if (url && !content) {
      // Fetch from URL
      const https = require('https');
      https.get(url, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          const channels = parseM3U(data);
          const existing = loadChannels();
          saveChannels([...existing, ...channels]);
          res.json({ imported: channels.length, total: saveChannels.length });
        });
      }).on('error', (e) => {
        res.status(400).json({ error: e.message });
      });
      return;
    }
    
    const channels = parseM3U(m3uContent);
    const existing = loadChannels();
    saveChannels([...existing, ...channels]);
    res.json({ imported: channels.length, total: saveChannels.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/channels/:id', (req, res) => {
  const channels = loadChannels().filter(ch => ch.id !== req.params.id);
  saveChannels(channels);
  res.json({ deleted: true });
});

app.delete('/api/channels', (req, res) => {
  saveChannels([]);
  res.json({ cleared: true });
});

// Stream proxy with proper headers, CORS, and HLS manifest rewriting
app.get('/api/stream/:id', (req, res) => {
  const id = decodeURIComponent(req.params.id);
  console.log('Manifest proxy:', { id, url: req.url });
  const channels = loadChannels();
  const channel = channels.find(ch => ch.id === id);
  
  if (!channel) {
    return res.status(404).send('Channel not found');
  }
  
  const url = channel.url;
  if (!url) {
    return res.status(400).send('No stream URL');
  }

  // ?src=N picks a backup mirror (0 = primary) for failover
  let targetUrl = url;
  const srcIdx = Math.max(0, parseInt(req.query.src || '0', 10) || 0);
  if (srcIdx > 0 && Array.isArray(channel.backupUrls) && channel.backupUrls[srcIdx - 1]) {
    targetUrl = channel.backupUrls[srcIdx - 1];
  }

  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  // Common IPTV headers to avoid blocks
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
    'Referer': 'https://iptv-org.github.io/'
  };

  // Forward range headers for seeking
  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const client = targetUrl.startsWith('https') ? https : http;
  
  client.get(targetUrl, { headers }, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    
    // Rewrite HLS manifests so ALL segments go through the same-origin proxy (CORS-safe for browsers)
    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || targetUrl.includes('.m3u8')) {
      let manifestData = '';
      proxyRes.on('data', chunk => manifestData += chunk);
      proxyRes.on('end', () => {
        // Upstream may answer an HTML page (geo-block / error) — never rewrite that into a fake manifest
        if (!looksLikeManifest(contentType, manifestData)) {
          res.setHeader('Content-Type', contentType || 'text/html');
          res.writeHead(200);
          res.end(manifestData);
          return;
        }
        const rewritten = rewriteManifest(manifestData, targetUrl);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Length', Buffer.byteLength(rewritten));
        res.writeHead(200);
        res.end(rewritten);
      });
      return;
    }
    
    // Forward content type and length for non-manifest files
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }
    if (proxyRes.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
    }
    
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('Stream proxy error:', e.message);
    res.status(500).send('Stream error: ' + e.message);
  });
});

// Proxy for stream segments and other resources
app.get('/api/stream-proxy', (req, res) => {
  const targetUrl = decodeURIComponent(req.query.url);
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
    'Referer': 'https://iptv-org.github.io/'
  };

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const client = targetUrl.startsWith('https') ? https : http;
  
  client.get(targetUrl, { headers }, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    
    // Rewrite HLS manifests to use proxy URLs for all segments
    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || targetUrl.includes('.m3u8')) {
      let manifestData = '';
      proxyRes.on('data', chunk => manifestData += chunk);
      proxyRes.on('end', () => {
        if (!looksLikeManifest(contentType, manifestData)) {
          res.setHeader('Content-Type', contentType || 'text/html');
          res.writeHead(200);
          res.end(manifestData);
          return;
        }
        const rewritten = rewriteManifest(manifestData, targetUrl);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Length', Buffer.byteLength(rewritten));
        res.writeHead(200);
        res.end(rewritten);
      });
      return;
    }
    
    // Forward content type and length for non-manifest files
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }
    if (proxyRes.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
    }
    
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('Stream proxy error:', e.message);
    res.status(500).send('Stream error: ' + e.message);
  });
});

// Cast page for external devices
app.get('/cast/:id', (req, res) => {
  const channel = loadChannels().find(ch => ch.id === req.params.id);
  if (!channel) {
    return res.status(404).send('Channel not found');
  }
  const streamUrl = `/api/stream/${encodeURIComponent(channel.id)}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${channel.name} - AURA IPTV Cast</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    :root {
      --bg: #0a0a0a;
      --text: #ffffff;
      --text2: #b0b0b0;
      --accent: #667eea;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .header {
      padding: 16px;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
      flex: 1;
    }
    .back-btn {
      padding: 8px 16px;
      background: rgba(255,255,255,0.1);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      font-size: 14px;
    }
    .back-btn:hover { background: rgba(255,255,255,0.2); }
    .player-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    video {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      background: #000;
      border-radius: 8px;
    }
    .error {
      color: #ef4444;
      text-align: center;
      padding: 20px;
    }
    .loading {
      color: var(--text2);
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/" class="back-btn">← Back</a>
    <h1>${channel.name}</h1>
  </div>
  <div class="player-container">
    <video id="video" controls autoplay muted playsinline></video>
  </div>
  <script>
    const video = document.getElementById('video');
    const streamUrl = '${streamUrl}';
    
    function playStream() {
      if (Hls.isSupported() && streamUrl.includes('.m3u8')) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.warn('Autoplay blocked:', e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          if (data.fatal) {
            document.querySelector('.player-container').innerHTML = '<div class="error">Stream error: ' + data.details + '</div>';
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(e => console.warn('Autoplay blocked:', e));
        });
      } else {
        video.src = streamUrl;
        video.play().catch(e => console.warn('Autoplay blocked:', e));
      }
    }
    
    // Try to play on load
    playStream();
    
    // Retry on click if blocked
    video.addEventListener('click', () => {
      if (video.paused) {
        video.play();
      }
    });
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AURA IPTV Node.js server running on http://0.0.0.0:${PORT}`);
  console.log(`📺 Channels: ${loadChannels().length}`);
});

// Shutdown endpoint for safe restarts
app.post('/api/shutdown', (req, res) => {
  res.json({ status: 'shutting_down' });
  gracefulShutdown();
});

// Health endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  res.json({ status: 'ok', uptime });
});
