const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseM3U(text) {
  const lines = text.split('\n');
  const channels = [];
  let current = null;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#EXTINF:')) {
      const namePart = t.split(',');
      const name = namePart[namePart.length - 1]?.trim() || 'Unknown';
      const logoMatch = t.match(/tvg-logo="([^"]*)"/);
      const groupMatch = t.match(/group-title="([^"]*)"/);
      const tvgIdMatch = t.match(/tvg-id="([^"]*)"/);
      
      current = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        name,
        logo: logoMatch?.[1] || '',
        group: groupMatch?.[1] || 'General',
        country: 'XX',
        language: 'Unknown',
        url: '',
        active: true,
        tvgId: tvgIdMatch?.[1] || ''
      };
    } else if (t && current && !t.startsWith('#')) {
      current.url = t;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}

function extractCountryFromTvgId(tvgId) {
  if (!tvgId) return 'XX';
  const match = tvgId.match(/\.([a-z]{2})@/i);
  return match ? match[1].toUpperCase() : 'XX';
}

function getCountryFlag(code) {
  const flags = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'ES': '🇪🇸',
    'IT': '🇮🇹', 'RU': '🇷🇺', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷',
    'BR': '🇧🇷', 'IN': '🇮🇳', 'MX': '🇲🇽', 'CA': '🇨🇦', 'AU': '🇦🇺',
    'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮',
    'PL': '🇵🇱', 'UA': '🇺🇦', 'TR': '🇹🇷', 'SA': '🇸🇦', 'AE': '🇦🇪',
    'EG': '🇪🇬', 'ZA': '🇿🇦', 'NG': '🇳🇬', 'KE': '🇰🇪', 'IL': '🇮🇱',
    'TH': '🇹🇭', 'VN': '🇻🇳', 'ID': '🇮🇩', 'MY': '🇲🇾', 'PH': '🇵🇭',
    'PK': '🇵🇰', 'BD': '🇧🇩', 'IR': '🇮🇷', 'IQ': '🇮🇶', 'SY': '🇸🇾',
    'LB': '🇱🇧', 'JO': '🇯🇴', 'PS': '🇵🇸', 'MA': '🇲🇦', 'DZ': '🇩🇿',
    'TN': '🇹🇳', 'LY': '🇱🇾', 'SD': '🇸🇩', 'ET': '🇪🇹', 'GH': '🇬🇭',
    'CO': '🇨🇴', 'AR': '🇦🇷', 'CL': '🇨🇱', 'PE': '🇵🇪', 'VE': '🇻🇪',
    'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 'UY': '🇺🇾', 'CU': '🇨🇺',
    'GR': '🇬🇷', 'PT': '🇵🇹', 'IE': '🇮🇪', 'AT': '🇦🇹', 'CH': '🇨🇭',
    'BE': '🇧🇪', 'CZ': '🇨🇿', 'SK': '🇸🇰', 'HU': '🇭🇺', 'RO': '🇷🇴',
    'BG': '🇧🇬', 'HR': '🇭🇷', 'RS': '🇷🇸', 'SI': '🇸🇮', 'LT': '🇱🇹',
    'LV': '🇱🇻', 'EE': '🇪🇪', 'MK': '🇲🇰', 'AL': '🇦🇱', 'GE': '🇬🇪',
    'AM': '🇦🇲', 'AZ': '🇦🇿', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'KG': '🇰🇬',
    'TJ': '🇹🇯', 'TM': '🇹🇲', 'MN': '🇲🇳', 'NP': '🇳🇵', 'LK': '🇱🇰',
    'MM': '🇲🇲', 'KH': '🇰🇭', 'LA': '🇱🇦', 'AF': '🇦🇫'
  };
  return flags[code] || '🌍';
}

const LANGUAGE_NAMES = {
  'eng': 'English', 'fra': 'French', 'deu': 'German', 'spa': 'Spanish',
  'ita': 'Italian', 'por': 'Portuguese', 'rus': 'Russian', 'zho': 'Chinese',
  'jpn': 'Japanese', 'kor': 'Korean', 'ara': 'Arabic', 'hin': 'Hindi',
  'tur': 'Turkish', 'fas': 'Persian', 'urd': 'Urdu', 'ben': 'Bengali',
  'vie': 'Vietnamese', 'tha': 'Thai', 'ind': 'Indonesian', 'msa': 'Malay',
  'nld': 'Dutch', 'swe': 'Swedish', 'nor': 'Norwegian', 'dan': 'Danish',
  'fin': 'Finnish', 'pol': 'Polish', 'ukr': 'Ukrainian', 'ces': 'Czech',
  'hun': 'Romanian', 'ron': 'Romanian', 'bul': 'Bulgarian', 'hrv': 'Croatian',
  'srp': 'Serbian', 'slk': 'Slovak', 'lit': 'Lithuanian', 'lav': 'Latvian',
  'est': 'Estonian', 'gre': 'Greek', 'heb': 'Hebrew', 'yid': 'Yiddish',
  'ell': 'Greek', 'cat': 'Catalan', 'eus': 'Basque', 'glg': 'Galician'
};

async function syncAll() {
  console.log('🚀 Starting full sync from iptv-org...\n');
  
  let allChannels = [];
  
  // 1. Fetch main playlist
  console.log('📡 Fetching main playlist (index.m3u)...');
  try {
    const mainM3U = await fetch('https://iptv-org.github.io/iptv/index.m3u');
    const mainChannels = parseM3U(mainM3U);
    console.log(`✅ Parsed ${mainChannels.length} channels from main playlist`);
    allChannels = mainChannels;
  } catch (e) {
    console.error('❌ Error fetching main playlist:', e.message);
  }
  
  // 2. Fetch category playlists
  console.log('\n📊 Fetching category playlists...');
  const categories = [
    'animation', 'auto', 'business', 'classic', 'comedy', 'cooking',
    'culture', 'documentary', 'education', 'entertainment', 'family',
    'general', 'interactive', 'kids', 'legislative', 'lifestyle',
    'movies', 'music', 'news', 'outdoor', 'public', 'relax',
    'religious', 'science', 'series', 'shop', 'sports', 'travel', 'weather'
  ];
  
  const categoryMap = new Map();
  for (const cat of categories) {
    try {
      const url = `https://iptv-org.github.io/iptv/categories/${cat}.m3u`;
      const data = await fetch(url);
      const channels = parseM3U(data);
      categoryMap.set(cat, channels.length);
      console.log(`  ✓ ${cat}: ${channels.length} channels`);
    } catch (e) {
      console.log(`  ✗ ${cat}: failed`);
    }
  }
  
  // 3. Fetch language playlists and build name->language map
  console.log('\n🗣️ Fetching language playlists...');
  const languages = [
    'eng', 'fra', 'deu', 'spa', 'ita', 'por', 'rus', 'zho',
    'jpn', 'kor', 'ara', 'hin', 'tur', 'fas', 'urd', 'ben'
  ];
  
  const nameToLanguage = new Map(); // channel name -> language name
  const languageCounts = new Map();
  
  for (const lang of languages) {
    try {
      const url = `https://iptv-org.github.io/iptv/languages/${lang}.m3u`;
      const data = await fetch(url);
      const langChannels = parseM3U(data);
      const langName = LANGUAGE_NAMES[lang] || lang;
      languageCounts.set(langName, langChannels.length);
      
      langChannels.forEach(ch => {
        nameToLanguage.set(ch.name, langName);
      });
      
      console.log(`  ✓ ${langName}: ${langChannels.length} channels`);
    } catch (e) {
      console.log(`  ✗ ${lang}: failed`);
    }
  }
  
  // 4. Build country index
  console.log('\n🌍 Building indices...');
  const countryIndex = new Map();
  
  allChannels.forEach(ch => {
    const countryCode = extractCountryFromTvgId(ch.tvgId);
    if (countryCode !== 'XX') {
      if (!countryIndex.has(countryCode)) {
        countryIndex.set(countryCode, []);
      }
      countryIndex.get(countryCode).push(ch);
    }
    
    // Assign language from map
    ch.language = nameToLanguage.get(ch.name) || 'Unknown';
  });
  
  console.log(`  Countries found: ${countryIndex.size}`);
  console.log(`  Top countries:`);
  const sortedCountries = [...countryIndex.entries()].sort((a, b) => b[1].length - a[1].length);
  sortedCountries.slice(0, 10).forEach(([code, chs]) => {
    console.log(`    ${getCountryFlag(code)} ${code}: ${chs.length} channels`);
  });
  
  // 5. Save enriched channels
  console.log('\n💾 Saving enriched channels...');
  
  const enrichedChannels = allChannels.map(ch => {
    const countryCode = extractCountryFromTvgId(ch.tvgId);
    return {
      id: ch.id,
      name: ch.name,
      logo: ch.logo,
      group: ch.group,
      country: countryCode,
      countryFlag: getCountryFlag(countryCode),
      language: ch.language,
      url: ch.url,
      active: true
    };
  });
  
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(enrichedChannels, null, 2));
  console.log(`✅ Saved ${enrichedChannels.length} channels to ${CHANNELS_FILE}`);
  
  // 6. Generate stats
  console.log('\n📊 Final Stats:');
  console.log(`   Total channels: ${enrichedChannels.length}`);
  
  const uniqueCategories = new Set();
  enrichedChannels.forEach(ch => {
    ch.group.split(';').forEach(g => uniqueCategories.add(g.trim()));
  });
  console.log(`   Categories: ${uniqueCategories.size}`);
  console.log(`   Countries: ${countryIndex.size}`);
  console.log(`   Languages: ${languageCounts.size}`);
  
  // Save metadata
  const metadata = {
    totalChannels: enrichedChannels.length,
    categories: [...uniqueCategories].sort(),
    countries: [...countryIndex.keys()].sort(),
    languages: [...languageCounts.keys()].sort(),
    categoryCounts: Object.fromEntries(categoryMap),
    languageCounts: Object.fromEntries(languageCounts),
    countryCounts: Object.fromEntries(sortedCountries.slice(0, 50).map(([code, chs]) => [code, chs.length])),
    lastSync: new Date().toISOString()
  };
  
  fs.writeFileSync(path.join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log(`✅ Metadata saved`);
  
  console.log('\n🎉 Sync complete!');
}

syncAll().catch(e => console.error('Fatal error:', e));
