// AURA IPTV — Firebase Analytics bootstrap (config fetched from /firebase-config.json)
(function () {
  'use strict';
  var analytics = null;

  function log(name, params) {
    try { if (analytics) analytics.logEvent(name, params || {}); } catch (e) {}
  }

  function init() {
    if (typeof firebase === 'undefined') return;
    fetch('/firebase-config.json').then(function (r) { return r.json(); }).then(function (cfg) {
      try {
        if (!cfg || !cfg.apiKey || String(cfg.apiKey).indexOf('...') !== -1) return;
        var app = firebase.initializeApp(cfg);
        analytics = firebase.analytics(app);
        log('page_view', { page_title: document.title, page_location: location.href });
      } catch (e) { /* analytics optional */ }
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  window.trackChannelPlay = function (name, id) {
    log('channel_play', { channel_name: name, channel_id: id });
    if (window.AuraAnalytics) window.AuraAnalytics.send('channel_play', { label: name });
  };
  window.trackSearch = function (term) { log('search', { search_term: term }); };
  window.trackAppOpen = function () { log('app_open', { timestamp: new Date().toISOString() }); };
  window.trackFavorite = function (name, id) { log('favorite_action', { channel_name: name, channel_id: id, action: 'toggle' }); };
  window.trackCast = function (name, id) { log('cast_action', { channel_name: name, channel_id: id }); };
  window.trackPageView = function (page) { log('page_view', { page_name: page, page_title: document.title }); };
  window.trackAdImpression = function (type) { log('ad_impression', { ad_type: type }); };
  window.trackAdClick = function (type, id) { log('ad_click', { ad_type: type, ad_id: id }); };
})();