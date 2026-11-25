// ============================================================
// AURA IPTV — UI 2.0 application logic
// ============================================================
(function () {
  'use strict';

  var t = function (k, v) { return window.AuraI18n ? window.AuraI18n.t(k, v) : k; };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- state ----------
  var channels = [];
  var byId = new Map();
  var categories = [];
  var countries = [];
  var favorites = [];
  var recent = [];
  var custom = [];
  try { favorites = JSON.parse(localStorage.getItem('aura-favorites') || '[]'); } catch (e) { favorites = []; }
  try { recent = JSON.parse(localStorage.getItem('aura-recent') || '[]'); } catch (e) { recent = []; }
  try { custom = JSON.parse(localStorage.getItem('aura-custom') || '[]'); } catch (e) { custom = []; }
  var favSet = new Set(favorites);

  var prefs = {
    theme: localStorage.getItem('aura-theme') || 'dark',
    autoplay: localStorage.getItem('aura-autoplay') !== 'false',
    buffer: parseInt(localStorage.getItem('aura-buffer') || '30', 10),
    datasaver: localStorage.getItem('aura-datasaver') === 'true',
    volume: parseInt(localStorage.getItem('aura-volume') || '100', 10),
    maxQuality: parseInt(localStorage.getItem('aura-maxquality') || '720', 10)
  };

  var currentPage = 'home';
  var liveFilter = { q: '', cat: '', country: '', sort: 'name', qres: 'All', qsort: 'qa' };
  var liveList = [];
  var liveCursor = 0;
  var countryList = [];
  var countryCursor = 0;
  var currentCountry = '';
  var viewState = {};
  try { viewState = JSON.parse(localStorage.getItem('aura-view')) || {}; } catch (e) { viewState = {}; }
  var BATCH = 120;

  // player state
  var currentChannel = null;
  var currentList = [];
  var currentIdx = -1;
  var currentSrcIdx = 0;
  var proxyOk = null;      // null = unknown, true = /api/stream works, false = use direct urls
  var directFallback = false;
  var hls = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECT = 6;
  var wakeLock = null;
  var hideTimer = null;
  var watchdog = null;
  var playerError = false;
  var channelSwitchCount = 0;
  var deferredInstall = null;

  var CAT_ICONS = {
    general: '📺', undefined: '📡', news: '📰', entertainment: '🎭', religious: '🕌',
    music: '🎵', movies: '🎬', sports: '⚽', series: '🎞️', kids: '🧸',
    documentary: '🌍', education: '🎓', culture: '🏛️', legislative: '🏢', animation: '🎨',
    comedy: '😂', lifestyle: '🌿', classic: '📼', shop: '🛒', business: '💼',
    outdoor: '🏕️', cooking: '🍳', family: '👨‍👩‍👧', travel: '✈️', auto: '🚗',
    weather: '⛅', science: '🔬', relax: '🧘', public: '🏙️', interactive: '🎮'
  };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function catName(group) {
    var key = 'cat.' + String(group || 'undefined').toLowerCase();
    var tr = t(key);
    return tr === key ? (group || 'Other') : tr;
  }
  function catIcon(group) { return CAT_ICONS[String(group || '').toLowerCase()] || '📺'; }
  function flagHTML(country) { return window.auraFlag ? window.auraFlag(country) : '🌍'; }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function fmt(n) { return Number(n).toLocaleString('en-US').replace(/,/g, ' '); }
  function channelsWord(n) {
    var lang = window.AuraI18n ? window.AuraI18n.lang() : 'en';
    if (lang === 'ru' || lang === 'uk') {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 'канал';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return lang === 'ru' ? 'канала' : 'канали';
      return lang === 'ru' ? 'каналов' : 'каналів';
    }
    return t('common.channels');
  }
  function countLabel(n) { return fmt(n) + ' ' + channelsWord(n); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function isNative() {
    return !!(window.androidBridge || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
  }

  // ---------- data ----------
  function dataUrl() {
    if (isNative()) return null; // asset bundle used instead
    return 'data/channels.json';
  }
  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .catch(function (e) { if (isNative()) return loadNativeAsset(url); throw e; });
  }
  function loadNativeAsset(url) {
    return new Promise(function (resolve, reject) {
      var key = '';
      if (url.indexOf('channels') !== -1) key = 'AURA_CHANNELS';
      else if (url.indexOf('categories') !== -1) key = 'AURA_CATEGORIES';
      else if (url.indexOf('countries') !== -1) key = 'AURA_COUNTRIES';
      var data = window.__auraIptvAssets;
      if (data && data[key]) { resolve(data[key]); return; }
      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = url.replace(/\.json$/, '.js');
      s.async = false;
      s.onerror = function () { reject(new Error('asset not found: ' + url)); };
      document.head.appendChild(s);
      setTimeout(function () { reject(new Error('asset timeout: ' + url)); }, 20000);
    });
  }
  function loadData() {
    // Instant open from fast cache (subset), full catalog refreshes in background
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('aura-fast-cache') || 'null'); } catch (e) {}
    if (cached && cached.channels && cached.channels.length && Date.now() - (cached.ts || 0) < 86400000) {
      channels = cached.channels.concat(custom);
      categories = cached.categories || [];
      countries = cached.countries || [];
      buildIndex();
      renderAll();
      initAds();
      if (window.trackAppOpen) window.trackAppOpen();
      refreshData(true);
      return Promise.resolve();
    }
    $('liveGrid').innerHTML = '<div class="loader" style="grid-column:1/-1"><div class="spinner"></div><span>Loading…</span></div>';
    return refreshData(false);
  }

  function refreshData(silent) {
    return Promise.all([
      loadJson('data/channels.json'),
      loadJson('data/categories.json'),
      loadJson('data/countries.json')
    ]).then(function (res) {
      channels = (res[0].channels || []).concat(custom);
      categories = res[1].categories || [];
      countries = res[2].countries || [];
      buildIndex();
      renderAll();
      if (!silent) {
        initAds();
        if (window.trackAppOpen) window.trackAppOpen();
      }
      try {
        var subset = channels.filter(function (c) { return c.logo; }).slice(0, 2500);
        if (subset.length < 500) subset = channels.slice(0, 2500);
        localStorage.setItem('aura-fast-cache', JSON.stringify({ channels: subset, categories: categories, countries: countries, ts: Date.now() }));
      } catch (e) {}
    }).catch(function (e) {
      console.error('Load error:', e);
      if (!silent) {
        toast(t('toast.load.error'));
        $('liveGrid').innerHTML = '';
      }
    });
  }

  function buildIndex() {
    byId = new Map();
    channels.forEach(function (ch) {
      ch._s = (ch.name + ' ' + ch.country + ' ' + ch.group + ' ' + (ch.language || '')).toLowerCase();
      byId.set(ch.id, ch);
    });
  }

  // ---------- cards ----------
  function logoHTML(ch, cls) {
    var initial = esc((ch.name || '?').trim().charAt(0).toUpperCase());
    if (prefs.datasaver || !ch.logo) return '<span class="initial">' + initial + '</span>';
    return '<span class="initial">' + initial + '</span><img src="' + esc(ch.logo) + '" alt="" loading="lazy" onerror="this.remove()">';
  }

  function cardHTML(ch, mini) {
    var isFav = favSet.has(ch.id);
    return '<button class="card' + (mini ? ' mini' : '') + '" data-id="' + esc(ch.id) + '">' +
      '<span class="card-fav' + (isFav ? ' on' : '') + '" data-fav="' + esc(ch.id) + '" role="button" aria-label="' + esc(t('player.fav')) + '">' + (isFav ? '★' : '☆') + '</span>' +
      '<span class="card-logo">' + logoHTML(ch) + '</span>' +
      '<span class="card-name">' + esc(ch.name) + '</span>' +
      '<span class="card-meta">' + flagHTML(ch.country) + '<span class="cat-tag">' + esc(catName(ch.group)) + '</span></span>' +
      '</button>';
  }

  function emptyHTML(icon, title, text) {
    return '<div class="empty"><div class="empty-ico">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
  }

  function renderBatch(grid, list, cursor) {
    var chunk = list.slice(cursor, cursor + BATCH);
    if (chunk.length) {
      grid.insertAdjacentHTML('beforeend', chunk.map(function (ch) { return cardHTML(ch); }).join(''));
    }
    return cursor + chunk.length;
  }

  // ---------- grid / list view ----------
  var VIEW_GRIDS = {
    live: 'liveGrid',
    categories: 'catGrid',
    countries: 'countryGrid',
    country: 'countryGridChannels',
    favorites: 'favGrid',
    recent: 'recentGrid'
  };

  function pageView(page) { return viewState[page] || 'grid'; }

  function applyView(page) {
    var view = pageView(page);
    var grid = VIEW_GRIDS[page] ? $(VIEW_GRIDS[page]) : null;
    if (grid) {
      grid.classList.toggle('view-list', view === 'list');
      grid.classList.toggle('view-grid', view === 'grid');
    }
    var tg = document.querySelector('#page-' + page + ' .view-toggle');
    if (tg) tg.querySelectorAll('.view-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
  }

  function setView(page, view) {
    viewState[page] = view;
    save('aura-view', viewState);
    applyView(page);
  }

  function applyAllViews() {
    Object.keys(VIEW_GRIDS).forEach(applyView);
  }

  // ---------- filtering ----------
  var ORDER = { '4320p': 0, '2160p': 1, '1440p': 2, '1080p': 3, '720p': 4, '576p': 5,
    '480p': 6, '360p': 7, '240p': 8, '144p': 9, 'SD': 10, 'Unknown': 11 };
  function resRank(ch) { return ch.qualityOrder === undefined ? 99 : ch.qualityOrder; }

  function applyLiveFilter() {
    var q = liveFilter.q.trim().toLowerCase();
    var tokens = q ? q.split(/\s+/) : [];
    var list = channels.filter(function (ch) {
      if (liveFilter.cat && String(ch.group).toLowerCase() !== liveFilter.cat) return false;
      if (liveFilter.country && ch.country !== liveFilter.country) return false;
      for (var i = 0; i < tokens.length; i++) if (ch._s.indexOf(tokens[i]) === -1) return false;
      if (liveFilter.qres !== 'All' && ch.qualityOrder !== undefined && resRank(ch) < ORDER[liveFilter.qres]) return false;
      return true;
    });
    if (liveFilter.qsort === 'qa') list = list.slice().sort(function (a, b) {
      return (resRank(b) - resRank(a)) || a.name.localeCompare(b.name);
    });
    else if (liveFilter.qsort === 'qd') list = list.slice().sort(function (a, b) {
      return (resRank(a) - resRank(b)) || a.name.localeCompare(b.name);
    });
    else if (liveFilter.sort === 'name') list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (liveFilter.sort === 'country') list = list.slice().sort(function (a, b) { return a.country.localeCompare(b.country) || a.name.localeCompare(b.name); });
    liveList = list;
    liveCursor = 0;
    var grid = $('liveGrid');
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = emptyHTML('🔍', t('live.empty.title'), t('live.empty.text'));
      $('liveMore').hidden = true;
    } else {
      liveCursor = renderBatch(grid, list, 0);
      $('liveMore').hidden = liveCursor >= list.length;
    }
    $('liveCount').textContent = countLabel(list.length);
    var sub = [];
    if (liveFilter.q) sub.push('“' + liveFilter.q + '”');
    if (liveFilter.cat) sub.push(catName(liveFilter.cat));
    if (liveFilter.country) sub.push(liveFilter.country);
    $('liveSub').textContent = sub.join(' · ');
    $('liveTitle').textContent = liveFilter.q ? t('live.title') : (liveFilter.cat ? catName(liveFilter.cat) : (liveFilter.country || t('live.title')));
    syncLiveControls();
    applyView('live');
  }

  function syncLiveControls() {
    document.querySelectorAll('#liveChips .chip').forEach(function (c) {
      c.classList.toggle('active', (c.dataset.cat || '') === liveFilter.cat);
    });
    $('filterCountry').value = liveFilter.country;
    $('filterQuality').value = liveFilter.qres;
    $('filterQSort').value = liveFilter.qsort;
  }

  // ---------- pages ----------
  function showPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var el = $('page-' + page);
    if (el) el.classList.add('active');
    document.querySelectorAll('[data-page]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.page === page);
    });
    window.scrollTo({ top: 0 });
    if (window.trackPageView) window.trackPageView(page);
    if (page === 'live') applyLiveFilter();
    if (page === 'favorites') renderFavorites();
    if (page === 'recent') renderRecent();
    if (page === 'countries') renderCountries();
    if (page === 'categories') applyView('categories');
    applyView(page);
  }

  function renderHome() {
    $('statChannels').textContent = fmt(channels.length);
    $('statCountries').textContent = fmt(countries.length);

    // continue watching
    var recCh = recent.map(function (id) { return byId.get(id); }).filter(Boolean).slice(0, 12);
    $('continueSection').hidden = !recCh.length;
    $('continueRow').innerHTML = recCh.map(function (ch) { return cardHTML(ch, true); }).join('');

    // popular: first logo-bearing channels from major countries
    var major = ['United States', 'United Kingdom', 'Russia', 'Sweden', 'Germany', 'France', 'Spain', 'Italy', 'Brazil', 'India', 'Turkiye', 'Ukraine', 'Canada', 'Poland'];
    var skip = { undefined: 1, religious: 1, shop: 1, legislative: 1 };
    var popular = [];
    major.forEach(function (c) {
      var n = 0;
      for (var i = 0; i < channels.length && n < 2; i++) {
        var ch = channels[i];
        if (ch.country === c && ch.logo && !skip[String(ch.group).toLowerCase()]) { popular.push(ch); n++; }
      }
    });
    $('popularRow').innerHTML = popular.sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (ch) { return cardHTML(ch, true); }).join('');

    // category chips (top 12)
    var top = categories.slice().sort(function (a, b) { return catName(a.name).localeCompare(catName(b.name)); }).slice(0, 12);
    $('homeCats').innerHTML = top.map(function (c) {
      return '<button class="chip" data-homecat="' + esc(c.name) + '"><span class="chip-ico">' + catIcon(c.name) + '</span>' + esc(catName(c.name)) + '<span class="chip-n">' + fmt(c.count) + '</span></button>';
    }).join('');

    // country tiles (top 14)
    var topC = countries.slice().sort(function (a, b) { return (a.name || a.code).localeCompare(b.name || b.code); }).slice(0, 14);
    $('homeCountries').innerHTML = topC.map(function (c) {
      return '<button class="country-tile" style="width:200px" data-country="' + esc(c.code) + '">' + flagHTML(c.code) + '<span class="country-name">' + esc(c.name || c.code) + '</span><span class="country-n">' + fmt(c.count) + '</span></button>';
    }).join('');
  }

  function renderLiveControls() {
    var top = categories.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
    $('liveChips').innerHTML = '<button class="chip" data-cat="">' + esc(t('live.all')) + '</button>' + top.map(function (c) {
      return '<button class="chip" data-cat="' + esc(c.name.toLowerCase()) + '"><span class="chip-ico">' + catIcon(c.name) + '</span>' + esc(catName(c.name)) + '</button>';
    }).join('');
    $('filterCountry').innerHTML = '<option value="">' + esc(t('nav.countries')) + ': ' + esc(t('live.all')) + '</option>' +
      countries.slice().sort(function (a, b) { return (a.name || a.code).localeCompare(b.name || b.code); }).map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.name || c.code) + ' (' + fmt(c.count) + ')</option>'; }).join('');
    $('filterQuality').innerHTML = '<option value="All">All quality</option>' +
      ['1080p', '720p', '576p', '560p', '480p', '360p', '240p', 'SD'].map(function (v) {
        return '<option value="' + v + '">' + v + '</option>';
      }).join('');
    $('filterQSort').innerHTML = '<option value="qa" selected>Better first</option>' +
      ['qd', 'name', 'country'].map(function (v) {
        return '<option value="' + v + '">' + (v === 'qd' ? 'Worse first' : (v === 'name' ? 'Name A–Z' : 'Country')) + '</option>';
      }).join('');
  }

  function renderCategories() {
    var sorted = categories.slice().sort(function (a, b) { return catName(a.name).localeCompare(catName(b.name)); });
    $('catGrid').innerHTML = sorted.map(function (c) {
      return '<button class="cat-tile" data-catpage="' + esc(c.name.toLowerCase()) + '">' +
        '<span class="cat-ico">' + catIcon(c.name) + '</span>' +
        '<span class="cat-name">' + esc(catName(c.name)) + '</span>' +
        '<span class="cat-count">' + countLabel(c.count) + '</span></button>';
    }).join('');
    applyView('categories');
  }

  function renderCountries() {
    var q = ($('countrySearch').value || '').trim().toLowerCase();
    var list = countries.filter(function (c) { return !q || c.code.toLowerCase().indexOf(q) !== -1 || (c.name || '').toLowerCase().indexOf(q) !== -1; });
    // Sort alphabetically by name
    list.sort(function (a, b) { return (a.name || a.code).localeCompare(b.name || b.code); });
    $('countryCount').textContent = fmt(list.length);
    var grid = $('countryGrid');
    grid.innerHTML = list.length ? list.map(function (c) {
      return '<button class="country-tile" data-country="' + esc(c.code) + '">' + flagHTML(c.code) + '<span class="country-name">' + esc(c.name || c.code) + '</span><span class="country-n">' + fmt(c.count) + '</span></button>';
    }).join('') : emptyHTML('🌍', t('live.empty.title'), t('live.empty.text'));
    applyView('countries');
  }

  function openCountry(code) {
    currentCountry = code;
    countryList = channels.filter(function (ch) { return ch.country === code; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    countryCursor = 0;
    $('countryFlag').innerHTML = flagHTML(code);
    var coInfo = null;
    for (var ci = 0; ci < countries.length; ci++) if (countries[ci].code === code) { coInfo = countries[ci]; break; }
    $('countryTitle').textContent = (coInfo && coInfo.name) || code;
    $('countrySub').textContent = t('countries.sub');
    $('countryChanCount').textContent = countLabel(countryList.length);
    var grid = $('countryGridChannels');
    grid.innerHTML = countryList.length ? '' : emptyHTML('📺', t('live.empty.title'), t('live.empty.text'));
    countryCursor = renderBatch(grid, countryList, 0);
    applyView('country');
    showPage('country');
  }

  function renderFavorites() {
    var list = favorites.map(function (id) { return byId.get(id); }).filter(Boolean)
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('favCount').textContent = fmt(list.length);
    $('favCountSide').textContent = list.length || '';
    $('favGrid').innerHTML = list.length ? list.map(function (ch) { return cardHTML(ch); }).join('')
      : emptyHTML('⭐', t('fav.empty.title'), t('fav.empty.text'));
    applyView('favorites');
  }

  function renderRecent() {
    var list = recent.map(function (id) { return byId.get(id); }).filter(Boolean);
    $('recentGrid').innerHTML = list.length ? list.map(function (ch) { return cardHTML(ch); }).join('')
      : emptyHTML('🕐', t('recent.empty.title'), t('recent.empty.text'));
    applyView('recent');
  }

  function renderAll() {
    renderHome();
    renderLiveControls();
    renderCategories();
    renderCountries();
    renderFavorites();
    renderRecent();
    applyAllViews();
    if (currentPage === 'live') applyLiveFilter();
    if (currentPage === 'country' && currentCountry) openCountry(currentCountry);
    if (currentChannel) updatePlayerMeta();
    if ($('drawer').classList.contains('open')) renderDrawer();
  }

  // ---------- favorites / recent ----------
  function toggleFav(id) {
    var ch = byId.get(id);
    if (!ch) return;
    if (favSet.has(id)) {
      favSet.delete(id);
      favorites = favorites.filter(function (x) { return x !== id; });
      toast(t('fav.removed'));
    } else {
      favSet.add(id);
      favorites.unshift(id);
      toast(t('fav.added'));
    }
    save('aura-favorites', favorites);
    if (window.trackFavorite) window.trackFavorite(ch.name, ch.id);
    document.querySelectorAll('.card-fav[data-fav]').forEach(function (el) {
      if (el.dataset.fav === id) {
        var on = favSet.has(id);
        el.classList.toggle('on', on);
        el.textContent = on ? '★' : '☆';
      }
    });
    $('favCountSide').textContent = favorites.length || '';
    if (currentPage === 'favorites') renderFavorites();
    if (currentChannel && currentChannel.id === id) updateFavBtn();
  }

  function pushRecent(id) {
    recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 40);
    save('aura-recent', recent);
  }

  // ---------- player ----------
  function video() { return $('videoPlayer'); }

  // Build the playable source for a channel. idx 0 = primary url,
  // idx > 0 = backupUrls[idx-1]. Web goes through the same-origin proxy.
  function streamSrc(ch, idx) {
    idx = idx || 0;
    var direct = ch.url;
    if (idx > 0 && ch.backupUrls && ch.backupUrls[idx - 1]) direct = ch.backupUrls[idx - 1];
    if (isNative() || proxyOk === false || directFallback) return direct;
    return '/api/stream/' + encodeURIComponent(ch.id) + '?src=' + idx;
  }

  // Static hosts (Firebase Hosting and friends) have no /api/stream route, so the
  // app must fall back to the broadcaster's own URL instead of getting index.html.
  function detectProxy() {
    if (proxyOk !== null) return Promise.resolve(proxyOk);
    return fetch('/api/health', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { proxyOk = !!(j && j.status === 'ok'); return proxyOk; })
      .catch(function () { proxyOk = false; return false; });
  }

  function openChannel(ch, list) {
    if (!ch) return;
    currentList = (list && list.length) ? list : liveList;
    currentIdx = currentList.indexOf(ch);
    if (currentIdx === -1) { currentList = [ch]; currentIdx = 0; }
    currentChannel = ch;
    playerError = false;
    reconnectAttempts = 0;
    currentSrcIdx = 0;
    directFallback = false;

    channelSwitchCount++;
    if (channelSwitchCount % 5 === 0 && window.Android && window.Android.showInterstitialAd) {
      try { window.Android.showInterstitialAd(); } catch (e) {}
    }

    $('playerOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    updatePlayerMeta();
    updateFavBtn();
    showStatus('loading');
    playStream(ch, streamSrc(ch, 0));
    pushRecent(ch.id);
    setupMediaSession(ch);
    requestWakeLock();
    if (window.trackChannelPlay) window.trackChannelPlay(ch.name, ch.id);
    renderHome();
    var v = video();
    v.volume = prefs.volume / 100;
    v.muted = false;
    $('pVol').value = prefs.volume;
    updateMuteIcon();
    resetHideTimer();
  }

  function updatePlayerMeta() {
    if (!currentChannel) return;
    $('playerTitle').textContent = currentChannel.name;
    $('playerSub').innerHTML = flagHTML(currentChannel.country) + '<span>' + esc(currentChannel.country) + '</span><span>·</span><span>' + esc(catName(currentChannel.group)) + '</span>';
  }

  function updateFavBtn() {
    if (!currentChannel) return;
    var on = favSet.has(currentChannel.id);
    $('pFav').classList.toggle('on', on);
    $('pFav').innerHTML = '<svg><use href="#' + (on ? 'i-star-fill' : 'i-star') + '"/></svg>';
  }

  function showStatus(kind) {
    var st = $('playerStatus');
    st.classList.add('show');
    $('statusActions').hidden = true;
    $('statusText').hidden = true;
    $('statusSpinner').style.display = '';
    if (kind === 'loading') {
      $('statusTitle').textContent = t('player.loading');
    } else if (kind === 'buffering') {
      $('statusTitle').textContent = t('player.buffering');
    } else if (kind === 'offline') {
      playerError = true;
      $('statusSpinner').style.display = 'none';
      $('statusTitle').textContent = t('player.offline.title');
      $('statusText').textContent = t('player.offline.text');
      $('statusText').hidden = false;
      $('statusActions').hidden = false;
    }
  }
  function hideStatus() { $('playerStatus').classList.remove('show'); }

  function hlsConfig() {
    var b = prefs.buffer || 30;
    return {
      enableWorker: false,
      lowLatencyMode: true,
      maxBufferLength: b,
      maxMaxBufferLength: b * 2,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 2,
      fragmentLoadingMaxRetry: 3,
      manifestLoadingMaxRetryTimeout: 5000,
      levelLoadingMaxRetryTimeout: 5000,
      fragmentLoadingMaxRetryTimeout: 8000
    };
  }

  function playAttempt(v) {
    var p = v.play();
    if (p && p.catch) p.catch(function () {
      // Autoplay with sound blocked -> retry muted (allowed everywhere)
      v.muted = true;
      updateMuteIcon();
      var p2 = v.play();
      if (p2 && p2.catch) p2.catch(function () {});
    });
  }

  function attachHls(url, ch) {
    var v = video();
    hls = new Hls(hlsConfig());
    hls.loadSource(url);
    hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      buildQualityMenu();
      applyQualityCap();
      if (prefs.autoplay) playAttempt(v);
    });
    hls.on(Hls.Events.LEVEL_LOADED, function () { buildQualityMenu(); });
    hls.on(Hls.Events.ERROR, function (e, data) {
      if (data.fatal) handleFatal(data);
    });
    hls.on(Hls.Events.BUFFER_STALLED, function () {
      if (hls && !playerError) { try { hls.recoverMediaError(); } catch (e2) {} }
    });
  }

  function playStream(ch, url) {
    var v = video();
    if (hls) { hls.destroy(); hls = null; }
    v.removeAttribute('src');
    v.load();
    reconnectAttempts = 0;
    playerError = false;
    $('pQuality').hidden = true;
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (currentChannel && currentChannel.id === ch.id && v.paused && !playerError) showStatus('offline');
    }, 25000);

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      try { attachHls(url, ch); return; } catch (e) { console.error('HLS init:', e); hls = null; }
    }
    // native HLS (Safari/iOS) or direct file
    v.src = url;
    if (prefs.autoplay) playAttempt(v);
  }

  function handleFatal(data) {
    if (!hls) return;
    // Proxy route dead (static host) -> retry once on the broadcaster's own URL
    if (!isNative() && !directFallback) {
      directFallback = true;
      toast(t('player.directmode'));
      try { hls.destroy(); hls = null; } catch (e) {}
      if (currentChannel) {
        reconnectAttempts = 0;
        showStatus('loading');
        playStream(currentChannel, streamSrc(currentChannel, currentSrcIdx));
      }
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      try { hls.recoverMediaError(); return; } catch (e) {}
    }
    attemptReconnect();
  }

  function attemptReconnect() {
    if (!currentChannel) return;
    var ch = currentChannel;
    var backups = Array.isArray(ch.backupUrls) ? ch.backupUrls.length : 0;
    // exhausted this source? roll over to the next mirror before giving up
    if (reconnectAttempts >= MAX_RECONNECT) {
      if (currentSrcIdx < backups) {
        currentSrcIdx++;
        reconnectAttempts = 0;
        toast(t('player.switchsource'));
      } else {
        showStatus('offline');
        return;
      }
    }
    reconnectAttempts++;
    var delay = 500 * Math.pow(1.5, reconnectAttempts - 1);
    setTimeout(function () {
      if (!currentChannel || currentChannel.id !== ch.id) return;
      if (hls) { hls.destroy(); hls = null; }
      var v = video();
      v.removeAttribute('src'); v.load();
      var src = streamSrc(ch, currentSrcIdx);
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        try { attachHls(src, ch); return; } catch (e) {}
      }
      v.src = src;
      if (prefs.autoplay) playAttempt(v);
    }, delay);
  }

  function buildQualityMenu() {
    if (!hls || !hls.levels || hls.levels.length < 2) { $('pQuality').hidden = true; return; }
    var max = prefs.maxQuality | 0;
    var sel = $('pQuality');
    var cur = hls.currentLevel;
    var html = '<option value="-1">' + esc(t('player.auto')) + '</option>';
    var shown = 0;
    hls.levels.forEach(function (l, i) {
      var h = l.height || 0;
      if (max && h && h > max) return; // capped out for fast loading
      shown++;
      var label = (h ? h + 'p' : Math.round((l.bitrate || 0) / 1000) + 'k');
      html += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    if (shown < 2) { sel.hidden = true; return; }
    sel.innerHTML = html;
    sel.hidden = false;
  }

  // Start on the best rendition that fits the "Max quality" preference,
  // so the picture is up in a couple of seconds instead of buffering HD.
  function applyQualityCap() {
    if (!hls || !hls.levels || !hls.levels.length) return;
    var max = prefs.maxQuality | 0;
    if (!max) return;
    var best = -1, bestH = -1;
    for (var i = 0; i < hls.levels.length; i++) {
      var h = hls.levels[i].height || 0;
      if (h && h <= max && h > bestH) { bestH = h; best = i; }
    }
    if (best > -1) {
      try { hls.currentLevel = best; hls.nextLevel = best; } catch (e) {}
    }
  }

  function closePlayer() {
    var v = video();
    v.pause();
    v.removeAttribute('src');
    v.load();
    if (hls) { hls.destroy(); hls = null; }
    clearTimeout(watchdog);
    releaseWakeLock();
    if (navigator.mediaSession) navigator.mediaSession.metadata = null;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function () {});
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    $('playerOverlay').classList.remove('active', 'autohide');
    $('drawer').classList.remove('open');
    document.body.style.overflow = '';
    currentChannel = null;
    hideStatus();
    if (window.auraFgStop) window.auraFgStop();
  }

  function stepChannel(dir) {
    if (!currentList.length) return;
    var idx = (currentIdx + dir + currentList.length) % currentList.length;
    openChannel(currentList[idx], currentList);
    if ($('drawer').classList.contains('open')) renderDrawer();
  }

  function togglePlay() {
    var v = video();
    if (v.paused) v.play().catch(function () {}); else v.pause();
  }

  function updatePlayIcon() {
    var paused = video().paused;
    $('pPlay').innerHTML = '<svg style="width:24px;height:24px"><use href="#' + (paused ? 'i-play' : 'i-pause') + '"/></svg>';
    $('pPlay').setAttribute('aria-label', t(paused ? 'player.play' : 'player.pause'));
  }

  function updateMuteIcon() {
    var v = video();
    var muted = v.muted || v.volume === 0;
    $('pMute').innerHTML = '<svg><use href="#' + (muted ? 'i-vol-x' : 'i-vol') + '"/></svg>';
    $('pMute').setAttribute('aria-label', t(muted ? 'player.unmute' : 'player.mute'));
  }

  function toggleMute() {
    var v = video();
    v.muted = !v.muted;
    updateMuteIcon();
  }

  function toggleFullscreen() {
    var overlay = $('playerOverlay');
    if (!document.fullscreenElement) {
      (overlay.requestFullscreen || overlay.webkitRequestFullscreen || function () {}).call(overlay);
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  function togglePip() {
    var v = video();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(function () {});
    } else if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
      v.requestPictureInPicture().catch(function () {});
    } else if (v.webkitSupportsPresentationMode && v.webkitSetPresentationMode) {
      v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    }
  }

  function resetHideTimer() {
    var overlay = $('playerOverlay');
    overlay.classList.remove('autohide');
    clearTimeout(hideTimer);
    if (!video().paused) {
      hideTimer = setTimeout(function () {
        if (!$('drawer').classList.contains('open')) overlay.classList.add('autohide');
      }, 2800);
    }
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }
  function releaseWakeLock() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
  }

  function setupMediaSession(ch) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ch.name,
        artist: ch.country || 'AURA IPTV',
        album: catName(ch.group),
        artwork: ch.logo ? [{ src: ch.logo, sizes: '512x512', type: 'image/png' }] : []
      });
      navigator.mediaSession.setActionHandler('play', function () { video().play().catch(function () {}); });
      navigator.mediaSession.setActionHandler('pause', function () { video().pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { stepChannel(-1); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { stepChannel(1); });
    } catch (e) {}
  }

  // ---------- cast ----------
  async function castStream() {
    if (!currentChannel) return;
    var v = video();
    if (v.webkitShowPlaybackTargetPicker) {
      try { v.webkitShowPlaybackTargetPicker(); return; } catch (e) {}
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Chromecast) {
      try {
        var CC = window.Capacitor.Plugins.Chromecast;
        await CC.initialize({ receiverApplicationId: 'CC1AD845' });
        await CC.show();
        await CC.loadMedia({ url: currentChannel.url });
        toast(t('cast.ok'));
        return;
      } catch (e) { toast(t('cast.fail')); return; }
    }
    if (typeof cast !== 'undefined' && cast.framework) {
      try {
        var ctx = cast.framework.CastContext.getInstance();
        ctx.setOptions({ receiverApplicationId: 'CC1AD845', autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
        var session = await ctx.requestSession();
        if (session) {
          var mi = new chrome.cast.media.MediaInfo(currentChannel.url, 'application/x-mpegURL');
          await session.loadMedia(new chrome.cast.media.LoadRequest(mi));
          toast(t('cast.ok'));
          if (window.trackCast) window.trackCast(currentChannel.name, currentChannel.id);
        }
      } catch (e) {
        toast(e && e.code === 'cancel' ? t('cast.cancel') : t('cast.fail'));
      }
      return;
    }
    toast(t('cast.none'));
  }

  // ---------- share ----------
  function shareChannel() {
    var text = currentChannel ? currentChannel.name + ' — AURA IPTV' : 'AURA IPTV';
    var data = { title: 'AURA IPTV', text: t('share.text'), url: location.origin + '/' };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(data.text + '\n' + data.url).then(function () { toast(t('share.copied')); }).catch(function () {});
    }
  }

  // ---------- drawer ----------
  function renderDrawer() {
    var q = ($('drawerSearch').value || '').trim().toLowerCase();
    var list = currentList.length ? currentList : channels;
    if (q) list = list.filter(function (ch) { return ch._s.indexOf(q) !== -1; });
    var shown = list.slice(0, 300);
    $('drawerList').innerHTML = shown.map(function (ch) {
      var cur = currentChannel && ch.id === currentChannel.id;
      var initial = esc((ch.name || '?').trim().charAt(0).toUpperCase());
      var logo = ch.logo && !prefs.datasaver
        ? '<span class="d-logo-wrap"><span class="d-initial">' + initial + '</span><img src="' + esc(ch.logo) + '" alt="" loading="lazy" onerror="this.remove()"></span>'
        : '<span class="d-logo-wrap"><span class="d-initial">' + initial + '</span></span>';
      return '<button class="drawer-item' + (cur ? ' current' : '') + '" data-did="' + esc(ch.id) + '">' + logo +
        '<span style="flex:1;min-width:0"><span class="d-name">' + esc(ch.name) + '</span>' +
        '<span class="d-meta">' + flagHTML(ch.country) + esc(catName(ch.group)) + '</span></span></button>';
    }).join('');
    if (list.length > 300) {
      $('drawerList').insertAdjacentHTML('beforeend', '<div style="padding:12px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">+' + fmt(list.length - 300) + ' — ' + esc(t('search.ph')) + '</div>');
    }
  }

  function toggleDrawer(force) {
    var d = $('drawer');
    var open = force !== undefined ? force : !d.classList.contains('open');
    d.classList.toggle('open', open);
    if (open) { renderDrawer(); $('drawerSearch').value = ''; }
    resetHideTimer();
  }

  // ---------- M3U ----------
  function exportM3U() {
    var list = favorites.map(function (id) { return byId.get(id); }).filter(Boolean);
    if (!list.length) { toast(t('fav.empty.title')); return; }
    var out = '#EXTM3U\n';
    list.forEach(function (ch) {
      out += '#EXTINF:-1 tvg-id="' + esc(ch.tvgId || ch.id) + '" tvg-logo="' + esc(ch.logo || '') + '" group-title="' + esc(ch.group || '') + '",' + ch.name + '\n' + ch.url + '\n';
    });
    var blob = new Blob([out], { type: 'audio/x-mpegurl' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aura-favorites.m3u';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    toast(t('m3u.exported'));
  }

  function parseM3U(text) {
    var lines = text.split(/\r?\n/);
    var out = [];
    var meta = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTINF:') === 0) {
        var comma = line.indexOf(',');
        var name = comma >= 0 ? line.slice(comma + 1).trim() : 'Channel';
        var attrs = line.slice(8, comma >= 0 ? comma : line.length);
        function attr(k) {
          var m = attrs.match(new RegExp(k + '="([^"]*)"'));
          return m ? m[1] : '';
        }
        meta = { name: name, logo: attr('tvg-logo'), group: attr('group-title') || 'Undefined', tvgId: attr('tvg-id') };
      } else if (line.charAt(0) !== '#') {
        if (/^https?:\/\//i.test(line)) {
          out.push({
            id: 'custom-' + Math.abs(hashCode(line)).toString(36),
            name: (meta && meta.name) || line.split('/').pop() || 'Channel',
            logo: meta ? meta.logo : '',
            group: meta ? meta.group : 'Undefined',
            country: 'International',
            language: '',
            url: line,
            tvgId: meta ? meta.tvgId : ''
          });
        }
        meta = null;
      }
    }
    return out;
  }

  function hashCode(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }

  function importM3U(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = parseM3U(String(reader.result));
      if (!parsed.length) { toast(t('m3u.error')); return; }
      var existing = new Set(channels.map(function (c) { return c.url; }));
      var added = parsed.filter(function (c) { return !existing.has(c.url); });
      custom = custom.concat(added);
      save('aura-custom', custom);
      channels = channels.concat(added);
      buildIndex();
      renderAll();
      toast(t('m3u.imported', { n: added.length }));
    };
    reader.readAsText(file);
  }

  function clearCustom() {
    if (!custom.length) return;
    var ids = new Set(custom.map(function (c) { return c.id; }));
    custom = [];
    save('aura-custom', custom);
    channels = channels.filter(function (c) { return !ids.has(c.id); });
    favorites = favorites.filter(function (id) { return !ids.has(id); });
    favSet = new Set(favorites);
    save('aura-favorites', favorites);
    recent = recent.filter(function (id) { return !ids.has(id); });
    save('aura-recent', recent);
    buildIndex();
    renderAll();
    toast(t('m3u.cleared'));
  }

  // ---------- ads ----------
  function initAds() {
    if (isNative()) return; // native ads handled by the app shell
    if (window.AuraAds && window.AuraAds.renderBanner) {
      window.AuraAds.renderBanner('adHome', { format: 'auto', id: 'home' });
      window.AuraAds.renderBanner('adLive', { format: 'auto', id: 'live' });
    }
  }

  // ---------- theme / prefs ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    $('themeIco').innerHTML = '<use href="#' + (prefs.theme === 'dark' ? 'i-moon' : 'i-sun') + '"/>';
    $('setTheme').checked = prefs.theme === 'dark';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = prefs.theme === 'dark' ? '#07080f' : '#f3f5fb';
  }
  function toggleTheme() {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('aura-theme', prefs.theme);
    applyTheme();
  }
  function applyDataSaver() {
    document.body.classList.toggle('data-saver', prefs.datasaver);
    $('setDataSaver').checked = prefs.datasaver;
  }

  function buildLangSelects() {
    var saved = localStorage.getItem('aura-lang') || 'auto';
    var opts = '<option value="auto">' + esc(t('set.auto')) + '</option>' + window.AuraI18n.langs.map(function (l) {
      return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>';
    }).join('');
    ['langSelectSide', 'langSelectMain'].forEach(function (id) {
      var sel = $(id);
      sel.innerHTML = opts;
      sel.value = saved;
    });
  }

  // ---------- events ----------
  function bindEvents() {
    // navigation
    document.querySelectorAll('[data-page]').forEach(function (b) {
      b.addEventListener('click', function () { showPage(b.dataset.page); });
    });

    // delegated card clicks
    document.addEventListener('click', function (e) {
      var fav = e.target.closest('.card-fav');
      if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
      var card = e.target.closest('.card');
      if (card) {
        var ch = byId.get(card.dataset.id);
        if (!ch) return;
        var list = currentPage === 'favorites' ? favorites.map(function (id) { return byId.get(id); }).filter(Boolean)
          : currentPage === 'recent' ? recent.map(function (id) { return byId.get(id); }).filter(Boolean)
          : currentPage === 'country' ? countryList
          : liveList;
        openChannel(ch, list);
        return;
      }
      var homeCat = e.target.closest('[data-homecat]');
      if (homeCat) { liveFilter.cat = homeCat.dataset.homecat.toLowerCase(); liveFilter.q = ''; $('searchInput').value = ''; $('searchWrap').classList.remove('has-value'); showPage('live'); return; }
      var catTile = e.target.closest('[data-catpage]');
      if (catTile) { liveFilter.cat = catTile.dataset.catpage; liveFilter.q = ''; showPage('live'); return; }
      var countryTile = e.target.closest('[data-country]');
      if (countryTile) { openCountry(countryTile.dataset.country); return; }
      var chip = e.target.closest('#liveChips .chip');
      if (chip) { liveFilter.cat = chip.dataset.cat || ''; applyLiveFilter(); return; }
      var dItem = e.target.closest('.drawer-item');
      if (dItem) {
        var dch = byId.get(dItem.dataset.did);
        if (dch) { openChannel(dch, currentList.length ? currentList : channels); renderDrawer(); }
        return;
      }
    });

    // search
    var searchTimer = null;
    $('searchInput').addEventListener('input', function () {
      var val = this.value;
      $('searchWrap').classList.toggle('has-value', !!val);
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        liveFilter.q = val;
        if (val && window.trackSearch) window.trackSearch(val);
        if (currentPage !== 'live') showPage('live'); else applyLiveFilter();
      }, 220);
    });
    $('searchInput').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { this.value = ''; $('searchWrap').classList.remove('has-value'); liveFilter.q = ''; applyLiveFilter(); this.blur(); }
    });
    $('searchClear').addEventListener('click', function () {
      $('searchInput').value = '';
      $('searchWrap').classList.remove('has-value');
      liveFilter.q = '';
      applyLiveFilter();
      $('searchInput').focus();
    });

    // filters
    $('filterCountry').addEventListener('change', function () { liveFilter.country = this.value; applyLiveFilter(); });
    $('filterQuality').addEventListener('change', function () { liveFilter.qres = this.value; applyLiveFilter(); });
    $('filterQSort').addEventListener('change', function () {
      liveFilter.qsort = this.value;
      liveFilter.sort = (this.value === 'name' || this.value === 'country') ? this.value : 'name';
      applyLiveFilter();
    });
    $('countrySearch').addEventListener('input', renderCountries);
    $('countryBack').addEventListener('click', function () { showPage('countries'); });

    // view toggle (all list pages)
    document.querySelectorAll('.view-toggle').forEach(function (tg) {
      var page = tg.closest('.page').id.replace(/^page-/, '');
      tg.querySelectorAll('.view-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { setView(page, btn.dataset.view); });
      });
    });

    // lazy load sentinels
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && currentPage === 'live' && liveCursor < liveList.length) {
          liveCursor = renderBatch($('liveGrid'), liveList, liveCursor);
          $('liveMore').hidden = liveCursor >= liveList.length;
        }
      }, { rootMargin: '900px' }).observe($('liveSentinel'));
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && currentPage === 'country' && countryCursor < countryList.length) {
          countryCursor = renderBatch($('countryGridChannels'), countryList, countryCursor);
        }
      }, { rootMargin: '900px' }).observe($('countrySentinel'));
    }
    $('liveMore').addEventListener('click', function () {
      liveCursor = renderBatch($('liveGrid'), liveList, liveCursor);
      this.hidden = liveCursor >= liveList.length;
    });

    // hero
    $('heroCta').addEventListener('click', function () {
      var withLogo = channels.filter(function (c) { return c.logo && c.url; });
      var pick = withLogo.length ? withLogo[Math.floor(Math.random() * Math.min(withLogo.length, 400))] : channels[0];
      if (pick) openChannel(pick, withLogo.slice(0, 400));
    });
    $('heroBrowse').addEventListener('click', function () { showPage('live'); });

    // theme / settings
    $('themeBtn').addEventListener('click', toggleTheme);
    $('setTheme').addEventListener('change', function () { if (this.checked !== (prefs.theme === 'dark')) toggleTheme(); });
    $('setDataSaver').addEventListener('change', function () {
      prefs.datasaver = this.checked;
      localStorage.setItem('aura-datasaver', String(prefs.datasaver));
      applyDataSaver();
      renderAll();
    });
    $('setAutoplay').checked = prefs.autoplay;
    $('setAutoplay').addEventListener('change', function () {
      prefs.autoplay = this.checked;
      localStorage.setItem('aura-autoplay', String(prefs.autoplay));
    });
    $('setBuffer').value = String(prefs.buffer);
    $('setBuffer').addEventListener('change', function () {
      prefs.buffer = parseInt(this.value, 10);
      localStorage.setItem('aura-buffer', this.value);
    });
    $('setMaxQuality').value = String(prefs.maxQuality || 0);
    $('setMaxQuality').addEventListener('change', function () {
      prefs.maxQuality = parseInt(this.value, 10) || 0;
      localStorage.setItem('aura-maxquality', String(prefs.maxQuality));
      applyQualityCap();
    });
    ['langSelectSide', 'langSelectMain'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        window.AuraI18n.setLang(this.value);
        buildLangSelects();
      });
    });
    document.addEventListener('aura:lang', function () {
      renderAll();
      if (currentChannel) { updatePlayerMeta(); updateFavBtn(); }
    });

    $('btnExport').addEventListener('click', exportM3U);
    $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
    $('fileImport').addEventListener('change', function () {
      if (this.files && this.files[0]) importM3U(this.files[0]);
      this.value = '';
    });
    $('btnClearCustom').addEventListener('click', clearCustom);
    $('clearRecent').addEventListener('click', function () {
      recent = [];
      save('aura-recent', recent);
      renderRecent();
      renderHome();
      toast(t('recent.cleared'));
    });

    // player controls
    $('pClose').addEventListener('click', closePlayer);
    $('pPlay').addEventListener('click', togglePlay);
    $('pPrev').addEventListener('click', function () { stepChannel(-1); });
    $('pNext').addEventListener('click', function () { stepChannel(1); });
    $('pMute').addEventListener('click', toggleMute);
    $('pVol').addEventListener('input', function () {
      var v = video();
      v.volume = this.value / 100;
      v.muted = this.value === '0';
      prefs.volume = parseInt(this.value, 10);
      localStorage.setItem('aura-volume', this.value);
      updateMuteIcon();
    });
    $('pFull').addEventListener('click', toggleFullscreen);
    $('pPip').addEventListener('click', togglePip);
    $('pCast').addEventListener('click', castStream);
    $('pShare').addEventListener('click', shareChannel);
    $('pFav').addEventListener('click', function () { if (currentChannel) toggleFav(currentChannel.id); });
    $('pList').addEventListener('click', function () { toggleDrawer(); });
    $('drawerClose').addEventListener('click', function () { toggleDrawer(false); });
    $('drawerSearch').addEventListener('input', renderDrawer);
    $('pQuality').addEventListener('change', function () {
      if (hls) hls.currentLevel = parseInt(this.value, 10);
    });
    $('statusRetry').addEventListener('click', function () {
      if (currentChannel) {
        reconnectAttempts = 0;
        showStatus('loading');
        playStream(currentChannel, streamSrc(currentChannel, currentSrcIdx));
      }
    });
    $('statusNext').addEventListener('click', function () { stepChannel(1); });
    $('playerStatus').addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      if (!playerError) { hideStatus(); playAttempt(video()); }
    });

    // video events
    var v = video();
    v.addEventListener('playing', function () {
      hideStatus();
      playerError = false;
      clearTimeout(watchdog);
      updatePlayIcon();
      resetHideTimer();
      if (window.auraFgStart) window.auraFgStart();
    });
    v.addEventListener('pause', updatePlayIcon);
    v.addEventListener('ended', function () { if (window.auraFgStop) window.auraFgStop(); });
    v.addEventListener('play', updatePlayIcon);
    v.addEventListener('waiting', function () { if (!playerError && $('playerOverlay').classList.contains('active')) showStatus('buffering'); });
    v.addEventListener('volumechange', updateMuteIcon);
    v.addEventListener('click', function () { togglePlay(); resetHideTimer(); });
    v.addEventListener('dblclick', toggleFullscreen);
    v.addEventListener('error', function () {
      if (!hls && currentChannel && !playerError) attemptReconnect();
    });

    // player idle hide
    ['mousemove', 'touchstart'].forEach(function (ev) {
      $('playerOverlay').addEventListener(ev, resetHideTimer, { passive: true });
    });
    document.addEventListener('fullscreenchange', function () {
      $('pFull').innerHTML = '<svg><use href="#' + (document.fullscreenElement ? 'i-min' : 'i-max') + '"/></svg>';
      resetHideTimer();
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      var playerOpen = $('playerOverlay').classList.contains('active');
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'select' || tag === 'textarea';
      if (playerOpen) {
        if (typing && e.key !== 'Escape') return;
        switch (e.key) {
          case ' ': case 'k': e.preventDefault(); togglePlay(); break;
          case 'f': toggleFullscreen(); break;
          case 'm': toggleMute(); break;
          case 'ArrowRight': stepChannel(1); break;
          case 'ArrowLeft': stepChannel(-1); break;
          case 'ArrowUp': e.preventDefault(); v.volume = Math.min(1, v.volume + 0.05); $('pVol').value = Math.round(v.volume * 100); break;
          case 'ArrowDown': e.preventDefault(); v.volume = Math.max(0, v.volume - 0.05); $('pVol').value = Math.round(v.volume * 100); break;
          case 'l': toggleDrawer(); break;
          case 'Escape':
            if ($('drawer').classList.contains('open')) toggleDrawer(false);
            else if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
            else closePlayer();
            break;
        }
        resetHideTimer();
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        $('searchInput').focus();
      }
    });

    // PWA install
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      $('installBtn').hidden = false;
    });
    $('installBtn').addEventListener('click', function () {
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall.userChoice.then(function () { deferredInstall = null; $('installBtn').hidden = true; });
      }
    });

    // keep wake lock on visibility return
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && currentChannel) requestWakeLock();
    });
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', function () {
    if (window.AuraI18n) window.AuraI18n.apply();
    applyTheme();
    applyDataSaver();
    buildLangSelects();
    bindEvents();
    detectProxy();
    loadData();
    if (!('pictureInPictureEnabled' in document) && !video().webkitSupportsPresentationMode) {
      $('pPip').style.display = 'none';
    }
  });
})();