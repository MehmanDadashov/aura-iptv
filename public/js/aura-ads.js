// AURA IPTV — реклама + ad-free слой (web / desktop / android WebView)
// - AdSense-баннеры на всех платформах, нативные форматы через мост window.Android
// - rewarded = 24 часа без рекламы, премиум-покупка = постоянный ad-free
// - события пишутся в Firebase Analytics и локальный счётчик
(function () {
  'use strict';

  var ADSENSE_CLIENT = 'ca-pub-1872308537877958';
  var AD_UNIT = '6393666225';
  var ADFREE_KEY = 'aura_adfree_until';
  var PREMIUM_KEY = 'aura_premium_owned';

  // Определяем платформу
  function platform() {
    if (typeof window !== 'undefined' && window.Android) return 'android';
    if (typeof window !== 'undefined' && window.androidBridge) return 'android';
    if (typeof navigator !== 'undefined' && navigator.userAgent.indexOf('Electron') !== -1) return 'desktop';
    return 'web';
  }

  // ------------------------------------------------------------- ad-free state

  function isAdFree() {
    try {
      if (localStorage.getItem(PREMIUM_KEY) === '1') return true;
      var until = Number(localStorage.getItem(ADFREE_KEY) || 0);
      return until > Date.now();
    } catch (e) { return false; }
  }

  function adFreeUntil() {
    try {
      if (localStorage.getItem(PREMIUM_KEY) === '1') return Infinity;
      return Number(localStorage.getItem(ADFREE_KEY) || 0);
    } catch (e) { return 0; }
  }

  function grantAdFree(ms) {
    var until = Date.now() + (ms || 864e5);
    try { localStorage.setItem(ADFREE_KEY, String(until)); } catch (e) {}
    hideAllBanners();
    return until;
  }

  function setPremiumOwned(owned) {
    try {
      if (owned) localStorage.setItem(PREMIUM_KEY, '1');
      else localStorage.removeItem(PREMIUM_KEY);
    } catch (e) {}
    if (owned) hideAllBanners();
  }

  function hideAllBanners() {
    try {
      var slots = document.querySelectorAll('.adsbygoogle, .ad-slot[id]');
      for (var i = 0; i < slots.length; i++) {
        var box = slots[i].closest ? slots[i].closest('.ad-slot') : null;
        if (box) box.style.display = 'none';
        slots[i].style.display = 'none';
      }
    } catch (e) {}
  }

  // Синхронизация с нативным entitle（JS-события от MainActivity）
  window.addEventListener('onAdFreeGranted', function (ev) {
    grantAdFree(864e5);
    logEvent('reward_granted', { ad_type: 'rewarded', platform: platform() });
  });
  window.addEventListener('onPremiumOwned', function () {
    setPremiumOwned(true);
    logEvent('premium_owned', { platform: platform() });
  });
  window.addEventListener('onPremiumRevoked', function () {
    setPremiumOwned(false);
    logEvent('premium_revoked', { platform: platform() });
  });

  // Нативный слой — источник правды на Android
  function nativeAdFree() {
    try {
      if (window.Android && typeof window.Android.isAdFree === 'function') {
        return window.Android.isAdFree();
      }
    } catch (e) {}
    return null;
  }

  // Лог событий в Firebase Analytics (если подключён)
  function logEvent(name, params) {
    try {
      if (typeof firebase !== 'undefined' && firebase.analytics) {
        firebase.analytics().logEvent(name, params || {});
      }
    } catch (e) { /* аналитика не критична */ }
    // Локальный счётчик
    try {
      var key = 'aura_ads_' + name;
      var cur = JSON.parse(localStorage.getItem(key) || '{}');
      cur.count = (cur.count || 0) + 1;
      cur.last = new Date().toISOString();
      cur.platform = platform();
      localStorage.setItem(key, JSON.stringify(cur));
    } catch (e) {}
    // Отправка на сервер для дашборда /admin/ (статический хостинг — best effort)
    try {
      var x = new XMLHttpRequest();
      x.open('GET', '/data/ad-event.php?event=' + encodeURIComponent(name) +
             '&type=' + encodeURIComponent((params && params.ad_type) || 'unknown') +
             '&platform=' + encodeURIComponent(platform()), true);
      x.send();
    } catch (e) {}
  }

  // Показ баннера с фолбэком, если AdSense не одобрен/не загрузился
  function renderBanner(container, opts) {
    opts = opts || {};
    if (nativeAdFree() === true || isAdFree()) return false;
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return false;

    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
    ins.setAttribute('data-ad-slot', AD_UNIT);
    ins.setAttribute('data-ad-format', opts.format || 'auto');
    ins.setAttribute('data-full-width-responsive', opts.responsive === false ? 'false' : 'true');
    el.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      logEvent('ad_impression', { ad_type: opts.format || 'auto', platform: platform(), slot: opts.id || 'unknown' });
      return true;
    } catch (e) {
      // Фолбэк: видимый блок, чтобы место не пустовало
      el.innerHTML = '<div class="ad-fallback">AURA IPTV — бесплатно. <a href="/download.html">Скачать приложение</a></div>';
      logEvent('ad_fallback', { ad_type: opts.format || 'auto', platform: platform() });
      return true;
    }
  }

  // Универсальная отправка события (реклама + любые события)
  function sendEvent(name, params) {
    try {
      var x = new XMLHttpRequest();
      var q = 'event=' + encodeURIComponent(name) + '&platform=' + encodeURIComponent(platform());
      if (params && params.label) q += '&label=' + encodeURIComponent(params.label);
      x.open('GET', '/data/event.php?' + q, true);
      x.send();
    } catch (e) {}
  }

  // Интерстишл: только нативно, с каденцией (нативная сторона дублирует guard)
  var INTERSTITIAL_MIN_MS = 120000;
  var lastInterstitial = 0;
  function maybeInterstitial(force) {
    if (nativeAdFree() === true || isAdFree()) return false;
    var now = Date.now();
    if (!force && now - lastInterstitial < INTERSTITIAL_MIN_MS) return false;
    lastInterstitial = now;
    if (window.Android && typeof window.Android.showInterstitialAd === 'function') {
      try { window.Android.showInterstitialAd(); } catch (e) {}
      logEvent('ad_impression', { ad_type: 'interstitial', platform: platform() });
      return true;
    }
    return false;
  }

  // Rewarded: нативно. В вебе — честный отказ (без фальшивой награды)
  function showRewarded() {
    if (nativeAdFree() === true || isAdFree()) return Promise.resolve(false);
    if (window.Android && typeof window.Android.showRewardedAd === 'function') {
      logEvent('ad_impression', { ad_type: 'rewarded', platform: platform() });
      try { window.Android.showRewardedAd(); } catch (e) {}
      return Promise.resolve(true);
    }
    logEvent('ad_rewarded_unavailable', { platform: platform() });
    return Promise.resolve(false);
  }

  window.AuraAnalytics = { send: sendEvent };

  // API для внешнего кода
  window.AuraAds = {
    client: ADSENSE_CLIENT,
    unit: AD_UNIT,
    platform: platform,
    logEvent: logEvent,
    renderBanner: renderBanner,
    isAdFree: isAdFree,
    adFreeUntil: adFreeUntil,
    grantAdFree: grantAdFree,
    setPremiumOwned: setPremiumOwned,
    hideAllBanners: hideAllBanners,
    maybeInterstitial: maybeInterstitial,
    showRewarded: showRewarded,
    // Клик по рекламе
    trackClick: function (type) {
      logEvent('ad_click', { ad_type: type || 'unknown', platform: platform() });
    },
    // Статистика для дашборда
    stats: function () {
      var out = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k.indexOf('aura_ads_') === 0) out[k.slice(9)] = JSON.parse(localStorage.getItem(k));
        }
      } catch (e) {}
      return out;
    }
  };
})();