/* Jelly Jars 2.0 - native bridge (production app com.kedaigamemy.jellyjars, same plugins as 1.0).
   Only active inside the Android app. Everything is optional: a missing plugin never breaks the game.
   - Firebase Analytics (same Firebase project as 1.0) + Meta app events (same Meta app as 1.0)
   - Android back button, app pause/resume hooks
   - 1.0 leftovers: cancels 1.0's scheduled reminder notifications, restores 1.0 purchases (No Ads / Supporter) */
(function () {
  'use strict';
  const cap = window.Capacitor, P = cap && cap.Plugins || {};
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const N = { native, noAds: false, onBack: null, onPause: null, onResume: null };
  window.JJNative = N;
  const safe = p => { try { if (p && p.catch) p.catch(() => {}); } catch (e) {} return p; };
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  if (!native) { N.track = () => {}; N.setProp = () => {}; return; }

  // ---- analytics ----
  const FA = P.FirebaseAnalytics, ME = P.MetaEvents;
  const meta = (name, params, value) => { if (!ME) return; const o = { name, params: params || {} }; if (value != null) o.valueToSum = value; safe(ME.logEvent(o)); };
  const MILESTONE = [5, 10, 20, 30];
  N.track = function (name, p) {
    p = p || {};
    if (FA) { const q = {}; for (const k of Object.keys(p).slice(0, 24)) { const v = p[k]; q[k.slice(0, 40)] = typeof v === 'number' ? v : String(v).slice(0, 100); } for (const k of ['level', 'attempt']) if (q[k] != null) q[k] = String(q[k]); safe(FA.logEvent({ name: name.slice(0, 40), params: q })); }
    // Meta: standard events usable for campaign optimisation + a few level milestones (same names as 1.0)
    if (name === 'level_complete') { meta('fb_mobile_level_achieved', { fb_level: String(p.level) }); if (p.level <= 10) meta('lvl_win_' + p.level); if (MILESTONE.includes(p.level)) meta('reached_level_' + p.level); }
    else if ((name === 'level_start' || name === 'level_failed') && p.level <= 10) meta((name === 'level_start' ? 'lvl_start_' : 'lvl_fail_') + p.level);
    else if (name === 'tutorial_complete') meta('fb_mobile_tutorial_completion', { fb_success: 1 });
    else if (name === 'ad_impression') meta('AdImpression', { fb_ad_type: p.format === 'rewarded' ? 'rewarded_video' : 'interstitial' }, p.value || 0);
    else if (name === 'continue_used' || name === 'beans_doubled' || name === 'daily_complete' || name === 'game_over') meta(name);
  };
  N.setProp = (key, value) => { if (FA) safe(FA.setUserProperty({ key, value: String(value) })); };

  // ---- app lifecycle ----
  const App = P.App;
  if (App) {
    safe(App.addListener('backButton', () => { if (N.onBack) N.onBack(); }));
    safe(App.addListener('pause', () => { if (N.onPause) N.onPause(); }));
    safe(App.addListener('resume', () => { if (N.onResume) N.onResume(); }));
  }
  N.minimize = () => { if (App) safe(App.minimizeApp()); };

  // ---- 1.0 leftovers ----
  // 1.0 scheduled "come back" reminders with 1.0 text. Clear them once so 2.0 players never get old-game notifications.
  N.clearOldReminders = async function () {
    const LN = P.LocalNotifications; if (!LN) return 0;
    try { const p = await within(LN.getPending(), 8000); const list = (p && p.notifications) || []; if (list.length) await LN.cancel({ notifications: list.map(n => ({ id: n.id })) }); return list.length; } catch (e) { return -1; }
  };
  // 1.0 sold No Ads (jj_noads) and Supporter (jj_supporter). Owners keep No Ads in 2.0 even after a reinstall.
  N.restorePurchases = async function () {
    const NP = P.NativePurchases; if (!NP) return { noAds: false };
    try {
      const r = await within(NP.getPurchases({ productType: 'inapp' }), 12000), list = (r && r.purchases) || [];
      let noAds = false, coins = 0;
      for (const t of list) {
        const id = t.productIdentifier || t.productId || '';
        if (id === 'jj_noads' || id === 'jj_supporter') { noAds = true; if (!t.isAcknowledged && (t.purchaseToken || t.transactionId)) safe(NP.acknowledgePurchase({ purchaseToken: t.purchaseToken || t.transactionId })); }
        else if (/^jj_coins_(\d+)$/.test(id) && (t.purchaseToken || t.transactionId)) { coins += +id.split('_')[2]; safe(NP.consumePurchase({ purchaseToken: t.purchaseToken || t.transactionId })); } // paid in 1.0 but never delivered
      }
      return { noAds, coins, n: list.length };
    } catch (e) { return { noAds: false, error: String(e && e.message || e).slice(0, 60) }; }
  };
})();
