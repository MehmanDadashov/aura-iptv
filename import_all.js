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
      
      current = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        name,
        logo: logoMatch?.[1] || '',
        group: groupMatch?.[1] || 'General',
        country: 'XX',
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

async function importAll() {
  console.log('🚀 Starting full import from iptv-org...\n');
  
  // 1. Import main playlist (all channels)
  console.log('📡 Fetching main playlist (index.m3u)...');
  try {
    const mainM3U = await fetch('https://iptv-org.github.io/iptv/index.m3u');
    console.log(`📦 Downloaded ${(mainM3U.length / 1024 / 1024).toFixed(1)} MB`);
    
    const mainChannels = parseM3U(mainM3U);
    console.log(`✅ Parsed ${mainChannels.length} channels from main playlist`);
    
    // Save
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(mainChannels, null, 2));
    console.log(`💾 Saved to ${CHANNELS_FILE}`);
    
    // Stats
    const countries = new Set(mainChannels.map(ch => ch.group));
    const categories = new Set(mainChannels.map(ch => ch.group));
    console.log(`\n📊 Stats:`);
    console.log(`   Total channels: ${mainChannels.length}`);
    console.log(`   Unique countries/groups: ${countries.size}`);
    
    // Sample
    console.log(`\n📺 Sample channels:`);
    mainChannels.slice(0, 5).forEach(ch => {
      console.log(`   ${ch.name} | ${ch.group} | ${ch.url.substring(0, 50)}`);
    });
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

importAll();
