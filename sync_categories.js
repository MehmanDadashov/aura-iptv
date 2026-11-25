const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const CATEGORY_FILE = path.join(DATA_DIR, 'channels_category.json');

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

async function syncCategories() {
  console.log('🚀 Syncing categories from iptv-org...\n');
  
  // 1. Load existing channels
  let existingChannels = [];
  if (fs.existsSync(CHANNELS_FILE)) {
    existingChannels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    console.log(`📂 Loaded ${existingChannels.length} existing channels`);
  }
  
  // 2. Fetch category playlist
  console.log('\n📡 Fetching category playlist (index.category.m3u)...');
  try {
    const categoryM3U = await fetch('https://iptv-org.github.io/iptv/index.category.m3u');
    const categoryChannels = parseM3U(categoryM3U);
    console.log(`✅ Parsed ${categoryChannels.length} channels from category playlist`);
    
    // 3. Merge with existing channels
    const existingUrls = new Set(existingChannels.map(ch => ch.url));
    const existingNames = new Set(existingChannels.map(ch => ch.name));
    
    let addedCount = 0;
    let updatedCount = 0;
    
    categoryChannels.forEach(ch => {
      const countryCode = extractCountryFromTvgId(ch.tvgId);
      ch.country = countryCode;
      ch.countryFlag = getCountryFlag(countryCode);
      
      // Check if channel exists by URL or name
      const existingIndex = existingChannels.findIndex(
        ec => ec.url === ch.url || ec.name === ch.name
      );
      
      if (existingIndex === -1) {
        // New channel
        existingChannels.push(ch);
        addedCount++;
      } else {
        // Update existing channel with category info
        const existing = existingChannels[existingIndex];
        if (!existing.group || existing.group === 'General') {
          existing.group = ch.group;
          updatedCount++;
        }
        if (!existing.country || existing.country === 'XX') {
          existing.country = countryCode;
          existing.countryFlag = getCountryFlag(countryCode);
        }
        if (!existing.logo && ch.logo) {
          existing.logo = ch.logo;
        }
      }
    });
    
    console.log(`\n📊 Merge results:`);
    console.log(`   Added: ${addedCount} new channels`);
    console.log(`   Updated: ${updatedCount} existing channels`);
    console.log(`   Total: ${existingChannels.length} channels`);
    
    // 4. Save merged channels
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(existingChannels, null, 2));
    console.log(`\n💾 Saved to ${CHANNELS_FILE}`);
    
    // 5. Generate category stats
    const categoryCounts = {};
    existingChannels.forEach(ch => {
      const cats = ch.group.split(';').map(g => g.trim()).filter(Boolean);
      const primary = cats[0] || 'General';
      categoryCounts[primary] = (categoryCounts[primary] || 0) + 1;
    });
    
    const categories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    
    console.log(`\n📁 Categories (${categories.length}):`);
    categories.slice(0, 20).forEach(cat => {
      console.log(`   ${cat.name}: ${cat.count} channels`);
    });
    
    // 6. Save category file
    fs.writeFileSync(CATEGORY_FILE, JSON.stringify(categories, null, 2));
    console.log(`\n✅ Categories saved to ${CATEGORY_FILE}`);
    
    console.log('\n🎉 Category sync complete!');
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

syncCategories().catch(e => console.error('Fatal error:', e));
