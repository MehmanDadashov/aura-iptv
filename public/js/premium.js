// AURA IPTV — Premium / ad-free UI.
// Rewarded = 24h ad-free; Play Billing = lifetime/monthly/yearly; restore supported.
// Works in browser (rewarded disabled there — honest "app only") and Android WebView.
(function () {
  'use strict';

  var modal = document.getElementById('premModal');
  var selectedPlan = 'lifetime';

  function t(key, fallback) {
    try {
      if (typeof window.t === 'function') {
        var v = window.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback || key;
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._premH);
    el._premH = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function ads() { return window.AuraAds || null; }

  function adFreeUntil() {
    var a = ads();
    return a ? a.adFreeUntil() : 0;
  }

  function fmtDate(ms) {
    try { return new Date(ms).toLocaleDateString(); } catch (e) { return ''; }
  }

  function refreshStatus() {
    var desc = document.getElementById('premStatusDesc');
    var until = adFreeUntil();
    if (until === Infinity) {
      if (desc) desc.textContent = t('prem.status.owned', 'Premium lifetime — ads off forever');
    } else if (until > Date.now()) {
      if (desc) desc.textContent = t('prem.status.adfree', 'Ad-free until {d}').replace('{d}', fmtDate(until));
    } else {
      if (desc) desc.textContent = t('prem.status.free', 'Free version — ads support development');
    }
    if (ads() && ads().hideAllBanners && adFreeUntil() > Date.now()) ads().hideAllBanners();
  }

  function billingAvailable() {
    var b = window.Android;
    return !!(b && typeof b.billingReady === 'function' && b.billingReady());
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add('show');
    var note = document.getElementById('premNote');
    if (note) note.hidden = billingAvailable();
  }

  function closeModal() {
    if (modal) modal.classList.remove('show');
  }

  function buy(plan) {
    var b = window.Android;
    if (!billingAvailable() || !b || typeof b.buyPlan !== 'function') {
      toast(t('prem.toast.nativeOnly', 'Available in the Android app'));
      return;
    }
    b.buyPlan(plan);
  }

  function restore() {
    var b = window.Android;
    if (!billingAvailable() || !b || typeof b.restorePurchases !== 'function') {
      toast(t('prem.toast.nativeOnly', 'Available in the Android app'));
      return;
    }
    toast(t('prem.toast.restored', 'Restore purchase'));
    b.restorePurchases();
  }

  function reward() {
    var a = ads();
    if (!a || typeof a.showRewarded !== 'function') {
      toast(t('prem.toast.nativeOnly', 'Available in the Android app'));
      return;
    }
    toast(t('prem.toast.adLoading', 'Loading ad…'));
    Promise.resolve(a.showRewarded()).then(function (ok) {
      if (!ok) toast(t('prem.toast.nativeOnly', 'Available in the Android app'));
    });
  }

  // ---------------------------------------------------------------- events

  window.addEventListener('onAdFreeGranted', function () {
    refreshStatus();
    toast(t('prem.toast.granted', 'Ad-free 24h granted'));
  });

  window.addEventListener('onPremiumOwned', function () {
    refreshStatus();
    closeModal();
    toast(t('prem.toast.owned', 'Premium activated — ads off'));
  });

  window.addEventListener('onBillingPurchase', function () {
    if (ads() && ads().setPremiumOwned) ads().setPremiumOwned(true);
    refreshStatus();
    closeModal();
    toast(t('prem.toast.owned', 'Premium activated — ads off'));
  });

  window.addEventListener('onBillingFailed', function () {
    toast(t('prem.toast.failed', 'Purchase failed'));
  });

  window.addEventListener('onBillingRestored', function (ev) {
    var active = !!(ev && ev.detail && ev.detail.active);
    if (active) {
      if (ads() && ads().setPremiumOwned) ads().setPremiumOwned(true);
      toast(t('prem.toast.restored', 'Purchase restored'));
    } else {
      toast(t('prem.toast.nopurchases', 'No purchases found'));
    }
    refreshStatus();
  });

  // ---------------------------------------------------------------- bindings

  function bind() {
    var openBtn = document.getElementById('premOpenBtn');
    if (openBtn) openBtn.addEventListener('click', openModal);
    var closeBtn = document.getElementById('premCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var buyBtn = document.getElementById('premBuyBtn');
    if (buyBtn) buyBtn.addEventListener('click', function () { buy(selectedPlan); });
    var restoreBtn = document.getElementById('premRestoreBtn');
    if (restoreBtn) restoreBtn.addEventListener('click', restore);
    var rewardBtn = document.getElementById('premRewardBtn');
    if (rewardBtn) rewardBtn.addEventListener('click', reward);

    document.querySelectorAll('.prem-plan').forEach(function (el) {
      el.addEventListener('click', function () {
        document.querySelectorAll('.prem-plan').forEach(function (x) { x.classList.remove('on'); });
        el.classList.add('on');
        if (el.dataset && el.dataset.plan) selectedPlan = el.dataset.plan;
      });
    });
    var first = document.querySelector('.prem-plan[data-plan="lifetime"]');
    if (first) first.classList.add('on');

    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); refreshStatus(); });
  } else {
    bind();
    refreshStatus();
  }

  window.AuraPremium = { refreshStatus: refreshStatus, open: openModal, buy: buy, restore: restore, reward: reward };
})();