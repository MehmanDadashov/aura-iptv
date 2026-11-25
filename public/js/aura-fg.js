/* ================================================================
   AuraFg — фоновое воспроизведение AURA IPTV (Capacitor/Android).
   Нативный плагин AuraFg держит foreground-сервис (mediaPlayback +
   wake lock + MediaSession) пока играет видео. Благодаря ему:
   - поток не прерывается, когда приложение уходит в фон / экран выключен;
   - на экране блокировки появляется плеер: play/pause/stop;
   - громкость управляется аппаратными кнопками (медиа-канал).
   В вебе и на десктопе — полный no-op.
   ================================================================ */
(function (global) {
  'use strict';

  var permAsked = false;

  function plugin() {
    var C = global.Capacitor;
    return (C && C.Plugins && C.Plugins.AuraFg) ? C.Plugins.AuraFg : null;
  }

  function start(title, body) {
    var p = plugin();
    if (!p || !p.start) return false;
    try {
      var ret = p.start({ title: title || 'AURA IPTV', body: body || 'Playing' });
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function stop() {
    var p = plugin();
    if (!p || !p.stop) return false;
    try {
      var ret = p.stop();
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function requestPermission() {
    var p = plugin();
    if (!p || !p.requestNotificationPermission) return false;
    try {
      var ret = p.requestNotificationPermission();
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  global.AuraFg = { start: start, stop: stop, requestPermission: requestPermission };

  // Заголовок/подзаголовок плеера берём из DOM — не связываемся с ui.js.
  global.auraFgStart = function () {
    var title = 'AURA IPTV';
    var body = 'Playing';
    try {
      var t = document.getElementById('playerTitle');
      if (t && t.textContent) title = t.textContent;
      var s = document.getElementById('playerSub');
      if (s && s.textContent) body = s.textContent;
    } catch (e) {}
    if (!permAsked) { permAsked = true; requestPermission(); }
    start(title, body);
  };

  global.auraFgStop = function () { stop(); };

  // Вызывается нативным сервисом (кнопки на экране блокировки).
  global.__auraFgToggle = function () {
    try {
      var v = document.getElementById('videoPlayer');
      if (!v) return;
      if (v.paused) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    } catch (e) {}
  };
})(window);