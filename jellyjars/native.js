/* Native bridge: real AdMob ads, consent, status bar and haptics when running as the Android/iOS app.
   In a normal browser this does nothing and the game falls back to its simulated ads. */
(function () {
  // ---- AdMob config ---------------------------------------------------------
  // TESTING = true shows Google's test ads (safe to tap). The phone-test APK keeps it true;
  // the CI flips it to false only for the Play Store bundle, so you never click your own real ads.
  var CFG = {
    TESTING: true,
    DEBUG_LOG: true,   // green ad log on the loading screen; CI turns this off for every Play bundle
    REWARDED_ID: 'ca-app-pub-9018020377555599/9566307240',
    INTERSTITIAL_ID: 'ca-app-pub-9018020377555599/6425138586',
    // Google Play Games leaderboard for the Daily Challenge (Play Console > Play Games Services > Leaderboards)
    LB_DAILY: 'CgkI2Ie8sp0YEAIQAQ',
    // weekly 'Levels cleared' leaderboard (Play Games makes the weekly view automatically); empty = feature hidden
    LB_WEEK: 'CgkI2Ie8sp0YEAIQAg'
  };

  var cap = window.Capacitor;
  var isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  // registerPlugin comes from vendor/capacitor.js (Capacitor core). Without it no native feature works,
  // so in that case fall back to the game's built-in behaviour instead of half-starting.
  if (isNative && typeof cap.registerPlugin !== 'function') { console.error('Capacitor core missing: native features off'); isNative = false; }
  var N = { native: isNative, ready: false, iapReady: false };
  window.NativeBridge = N;
  if (!isNative) return;

  var AdMob = cap.registerPlugin('AdMob');
  var StatusBar = cap.registerPlugin('StatusBar');
  var Haptics = cap.registerPlugin('Haptics');

  // ---- Firebase Analytics ---------------------------------------------------
  var FA = cap.registerPlugin('FirebaseAnalytics');
  var Meta = cap.registerPlugin('MetaEvents');
  function meta(name, params, value) { try { var o = { name: name, params: params || {} }; if (value != null) o.valueToSum = value; Meta.logEvent(o).catch(function () {}); } catch (e) {} }
  // Meta standard events (usable as campaign optimization goals) + level milestones
  function toMeta(name, p) {
    p = p || {};
    if (name === 'level_complete') { meta('fb_mobile_level_achieved', { fb_level: String(p.level) }); if (p.level <= 10) meta('lvl_win_' + p.level, {}); if (p.level <= 10 && p.secs > 90) meta('lvl_slow_' + p.level, {});
      if ([5, 10, 20, 30, 50].indexOf(p.level) >= 0) meta('reached_level_' + p.level, {}); }
    else if ((name === 'level_start' || name === 'level_fail') && p.level <= 10) { meta((name === 'level_start' ? 'lvl_start_' : 'lvl_fail_') + p.level, {}); if (name === 'level_fail' && p.secs > 90) meta('lvl_slow_' + p.level, {}); }
    else if (name === 'rw_tap') { meta('rw_tap', {}); meta(p.pre === 1 ? 'rw_tap_ready' : p.pre === 0 ? 'rw_tap_cold' : 'rw_tap_unk', {}); }
    else if (name === 'rw_ok') meta('rw_ok_' + (p.src || 'x'), {});
    else if (name === 'level_abandon' && p.level <= 10) meta('lvl_quit_' + p.level, {});
    else if (name === 'iap_ready') meta('iap_ready', {});
    else if (name === 'rw_none') { meta('rw_none', {}); meta('rw_none_' + String(p.r || 'x').slice(0, 12), {}); }
    else if (name === 'inter_none') meta('inter_none', {});
    else if (name === 'lives_out') meta('lives_out', {});
    else if (name === 'ret') meta('ret_d' + p.d, {});
    else if (name === 'play_min') meta('play_' + p.m + 'm', {});
    else if (name === 'quit_after_ad') meta('quit_after_' + p.kind, {});
    else if (name === 'bg_mid') meta('bg_mid_' + p.level, {});
    else if (name === 'sess_end') meta('sess_lv_' + p.lv, {});
    else if (name === 'iap_purchase') meta('fb_mobile_purchase', { fb_content_id: String(p.id), fb_currency: String(p.currency || 'USD') }, Number(p.price) || 0);
    else if (['starter_seen', 'park_tip', 'park_ok', 'stack_tip', 'out_of_lives', 'level_skip', 'lucky_spin', 'notif_optin', 'outfit_buy', 'daily_start', 'daily_complete', 'quest_complete', 'world_ad', 'js_error', 'dress_tip_open', 'park_tip'].indexOf(name) >= 0) meta(name, {});
    else if (name === 'booster_used') meta('boost_' + p.type, {});
    else if (name === 'tutorial_complete') meta('fb_mobile_tutorial_completion', { fb_success: 1 });
    else if (name === 'rewarded_ad_watched') meta('AdImpression', { fb_ad_type: 'rewarded_video' });
    else if (name === 'interstitial_shown') meta('AdImpression', { fb_ad_type: 'interstitial' });
    else if (name === 'revive') meta('revive_used', { method: p.method });
  }
  N.testing = CFG.TESTING;
  N.debugLog = !!CFG.DEBUG_LOG;
  N.track = function (name, params) { try { var q = Object.assign({}, params || {}); ['level', 'attempt', 'world'].forEach(function (k) { if (q[k] != null) q[k] = String(q[k]); }); FA.logEvent({ name: name, params: q }).catch(function () {}); } catch (e) {} toMeta(name, params); };
  N.setProp = function (key, value) { try { FA.setUserProperty({ key: key, value: String(value) }).catch(function () {}); } catch (e) {} };

  // ---- Google Play Games: Daily Challenge leaderboard ----------------------
  // Everything resolves to {available:false} until Play Games is set up, so the game just shows your own best time.
  var PG = cap.registerPlugin('PlayGames');
  var pgOff = { available: false };
  function pg(m, a) { if (!CFG.LB_DAILY) return Promise.resolve(pgOff); try { return PG[m](a || {}).catch(function () { return pgOff; }); } catch (e) { return Promise.resolve(pgOff); } }
  N.lb = {
    on: function () { return !!CFG.LB_DAILY; },
    status: function () { return pg('status'); },
    signIn: function () { return pg('signIn'); },
    submit: function (ms) { return pg('submit', { id: CFG.LB_DAILY, score: Math.round(ms) }); },
    show: function () { return pg('signIn').then(function (s) { return s.signedIn ? pg('show', { id: CFG.LB_DAILY }) : s; }); },
    rank: function () { return pg('rank', { id: CFG.LB_DAILY }); }
  };
  N.lbw = {
    on: function () { return !!CFG.LB_WEEK; },
    submit: function (n) { return CFG.LB_WEEK ? pg('submit', { id: CFG.LB_WEEK, score: Math.round(n) }) : Promise.resolve(pgOff); },
    show: function () { return CFG.LB_WEEK ? pg('signIn').then(function (s) { return s.signedIn ? pg('show', { id: CFG.LB_WEEK, span: 'weekly' }) : s; }) : Promise.resolve(pgOff); },
    rank: function () { return CFG.LB_WEEK ? pg('rank', { id: CFG.LB_WEEK, span: 'weekly' }) : Promise.resolve(pgOff); }
  };

  N.haptic = function (ms) { try { Haptics.vibrate({ duration: Math.max(10, Math.min(80, ms || 15)) }); } catch (e) {} };

  var rewardLoaded = false, interLoaded = false, loadingR = false, loadingI = false;
  N.lastAdError = '';
  // Ad diagnostics: every step is written here; test builds show it live on the loading screen
  var T0 = Date.now(); N.adLog = [];
  function alog(m) {
    var line = ((Date.now() - T0) / 1000).toFixed(1) + 's ' + m;
    N.adLog.push(line); if (N.adLog.length > 40) N.adLog.shift();
    try { var el = document.getElementById('adlog'); if (el) el.textContent = N.adLog.slice(-9).join('\n'); } catch (e) {}
  }
  N.alog = alog;
  function brief(e) { try { if (e == null) return ''; if (typeof e === 'string') return e; var o = []; ['code', 'message', 'domain', 'cause'].forEach(function (k) { if (e[k] != null) o.push(k + '=' + e[k]); }); return o.join(' ') || JSON.stringify(e).slice(0, 160); } catch (x) { return '?'; } }
  function errText(e) { try { return (e && (e.message || e.code)) || (typeof e === 'string' ? e : JSON.stringify(e)); } catch (x) { return 'unknown'; } }
  var errN = {};
  function noteErr(where, e) { if (/^load /.test(where)) { errN[where] = (errN[where] || 0) + 1; if (errN[where] > 4) { alog('ERR ' + where + ' (quiet): ' + brief(e)); return; } } meta('ad_err', {}); meta('ad_err_' + String(where).replace(/[^a-z]+/gi, '_').slice(0, 24), {}); try { var cd = e && e.code; if (cd == null) { var mm = /code[=: ]+(-?\d+)/.exec(String(e && e.message || e)); cd = mm && mm[1]; } if (cd == null && /timeout/i.test(errText(e))) cd = 'timeout'; if (cd != null) meta('ad_code_' + String(cd).replace(/[^a-z0-9]+/gi, '_').slice(0, 16), {}); } catch (x) {} N.lastAdError = where + ': ' + errText(e); alog('ERR ' + where + ': ' + brief(e)); N.track('ad_error', { where: where, msg: String(N.lastAdError).slice(0, 90) }); }
  // gives up after ms, so the game never hangs waiting on the ad SDK
  function within(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout ' + ms + 'ms')); }, ms); })]); }
  // One rewarded load at a time. A tap during a background load waits for that same load instead of
  // starting a second one (two overlapping loads could leave the SDK with nothing to show).
  var rLoadP = null, rLoadedAt = 0;
  function freshReward() { return rewardLoaded && Date.now() - rLoadedAt < 50 * 60 * 1000; } // AdMob ads expire after an hour
  function loadRewardP(ms) {
    if (rLoadP) return rLoadP;
    loadingR = true; alog('rewarded: loading');
    rLoadP = within(AdMob.prepareRewardVideoAd({ adId: CFG.REWARDED_ID, isTesting: CFG.TESTING }), ms || 40000)
      .then(function () { rewardLoaded = true; rLoadedAt = Date.now(); alog('rewarded: ready'); meta('ad_loaded', {}); })
      .finally(function () { loadingR = false; rLoadP = null; });
    return rLoadP;
  }
  var rFails = 0, iFails = 0; function backoff(n) { return Math.min(60000, 10000 * n); }
  function loadReward() {
    if (rLoadP || freshReward() || !N.ready) return; rewardLoaded = false;
    loadRewardP().then(function () { rFails = 0; }).catch(function (e) { noteErr('load rewarded', e); rFails++; setTimeout(loadReward, backoff(rFails)); });
  }
  function loadInter() {
    if (loadingI || interLoaded || !N.ready) return; loadingI = true; alog('interstitial: loading');
    within(AdMob.prepareInterstitial({ adId: CFG.INTERSTITIAL_ID, isTesting: CFG.TESTING }), 40000)
      .then(function () { interLoaded = true; iFails = 0; alog('interstitial: ready'); })
      .catch(function (e) { noteErr('load interstitial', e); iFails++; setTimeout(loadInter, backoff(iFails)); })
      .then(function () { loadingI = false; });
  }

  (async function boot() {
    try { await StatusBar.hide(); } catch (e) {}
    // AdMob's initialize can report a failure even though ads still work, so never let it block ads
    alog('init start (test ads: ' + CFG.TESTING + ')');
    try { await within(AdMob.initialize({ initializeForTesting: CFG.TESTING }), 15000); alog('init ok'); }
    catch (e) { noteErr('init', e); }
    try {
      var ci = await within(AdMob.requestConsentInfo(), 10000);
      alog('consent: ' + (ci && ci.status) + ', form ' + (ci && ci.isConsentFormAvailable));
      if (ci && ci.isConsentFormAvailable && ci.status === 'REQUIRED') ci = await AdMob.showConsentForm();
      N.privacyRequired = !!(ci && ci.privacyOptionsRequirementStatus === 'REQUIRED');
    } catch (e) { noteErr('consent', e); }
    N.ready = true; alog('ads ready'); loadReward(); loadInter();
  })();

  N.privacyRequired = false;
  N.showPrivacy = function () { try { AdMob.showPrivacyOptionsForm().catch(function () {}); } catch (e) {} };

  // ---- App lifecycle + Android back button ------------------------------------
  var App = cap.registerPlugin('App');
  function appOn(ev, fn) { try { var p = App.addListener(ev, fn); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  appOn('backButton', function () { if (window.onNativeBack) window.onNativeBack(); });
  appOn('pause', function () { if (window.onAppPause) window.onAppPause(); });
  appOn('resume', function () { if (window.onAppResume) window.onAppResume(); setTimeout(function () { try { if (!freshReward()) { rFails = 0; loadReward(); } if (!interLoaded) { iFails = 0; loadInter(); } } catch (e) {} }, 1200); });
  N.minimize = function () { try { App.minimizeApp().catch(function () {}); } catch (e) {} };

  // ---- In-app review (Google's own rating sheet) -------------------------------
  var Review = cap.registerPlugin('InAppReview');
  N.requestReview = function () { try { Review.requestReview().catch(function () {}); } catch (e) {} };

  // ---- Local notifications (no server needed) ----------------------------------
  var LN = cap.registerPlugin('LocalNotifications');
  N.askNotifications = async function () {
    try { var c = await LN.checkPermissions(); if (c.display === 'granted') return true;
      var r = await LN.requestPermissions(); return r.display === 'granted'; } catch (e) { return false; }
  };
  N.notificationsGranted = async function () { try { return (await LN.checkPermissions()).display === 'granted'; } catch (e) { return false; } };
  // list: [{id, title, body, at(ms)}]; replaces everything previously scheduled
  N.scheduleNotifications = async function (list) {
    try {
      var pending = await LN.getPending();
      if (pending && pending.notifications && pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(function (n) { return { id: n.id }; }) });
      if (!list || !list.length || !(await N.notificationsGranted())) return;
      await LN.schedule({ notifications: list.map(function (n) {
        return { id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true }, isExactNotification: false, smallIcon: 'ic_stat_jelly', iconColor: '#FF4F9A' };
      }) });
    } catch (e) {}
  };

  // ---- In-app purchases (Google Play Billing) ----------------------------------
  // Flow: buy -> game grants the items and saves -> only then consume (coins) or acknowledge (No Ads).
  // Anything bought but not yet granted (crash, pending cash payment) is picked up by iapOwned() on the next start.
  var NP = cap.registerPlugin('NativePurchases');
  N.iap = { ready: false, products: {} };
  N.iapLoad = async function (ids) {
    try {
      var s = await within(NP.isBillingSupported(), 8000); if (!s || !s.isBillingSupported) { alog('billing not supported'); return false; }
      var r = await within(NP.getProducts({ productIdentifiers: ids, productType: 'inapp' }), 12000);
      (r && r.products || []).forEach(function (p) { N.iap.products[p.identifier] = p; });
      N.iap.ready = Object.keys(N.iap.products).length > 0; alog('iap products: ' + Object.keys(N.iap.products).length);
      return N.iap.ready;
    } catch (e) { noteErr('iap load', e); return false; }
  };
  N.iapBuy = async function (id) {
    try {
      var t = await NP.purchaseProduct({ productIdentifier: id, productType: 'inapp', quantity: 1, isConsumable: false, autoAcknowledgePurchases: false });
      return { ok: true, t: t };
    } catch (e) { var m = errText(e); return { ok: false, pending: /pending/i.test(m), cancelled: /cancel/i.test(m), msg: m }; }
  };
  N.iapOwned = async function () { try { var r = await within(NP.getPurchases({ productType: 'inapp' }), 12000); return (r && r.purchases) || []; } catch (e) { return []; } };
  N.iapFinish = async function (t, consumable) {
    var tok = t.purchaseToken || t.transactionId; if (!tok) return;
    try { if (consumable) await NP.consumePurchase({ purchaseToken: tok }); else if (!t.isAcknowledged) await NP.acknowledgePurchase({ purchaseToken: tok }); }
    catch (e) { noteErr('iap finish', e); }
  };

  // Listeners are attached once at startup (never awaited inside an ad call, because a stuck
  // addListener was freezing the game). Each ad call just points these hooks at itself.
  var RW = null, IN = null;   // the ad call currently in progress
  function on(ev, fn) { try { var p = AdMob.addListener(ev, fn); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  on('onRewardedVideoAdLoaded', function () { alog('ev rewarded loaded'); });
  on('onRewardedVideoAdFailedToLoad', function (e) { alog('ev rewarded FAILED to load: ' + brief(e)); });
  on('interstitialAdFailedToLoad', function (e) { alog('ev interstitial FAILED to load: ' + brief(e)); });
  on('onRewardedVideoAdReward', function () { alog('ev reward earned'); if (RW) RW.earned = true; });
  on('onRewardedVideoAdShowed', function () { alog('ev rewarded showed'); N.adOpen = true; if (RW) RW.shown = true; });
  on('onRewardedVideoAdDismissed', function () { alog('ev rewarded closed'); N.adOpen = false; if (RW) { var c = RW; setTimeout(function () { c.finish(c.earned ? 'earned' : 'skipped'); }, 300); } });
  on('onRewardedVideoAdFailedToShow', function (e) { N.adOpen = false; if (RW) { noteErr('show rewarded', e); RW.finish('unavailable'); } });
  on('interstitialAdShowed', function () { N.adOpen = true; if (IN) IN.shown = true; });
  on('interstitialAdDismissed', function () { N.adOpen = false; if (IN) IN.finish(true); });
  on('interstitialAdFailedToShow', function (e) { if (IN) { noteErr('show interstitial', e); IN.finish(false); } });

  // resolves 'earned' | 'skipped' | 'unavailable'; guaranteed to answer within ~20s
  N.rewardReady = function () { return freshReward(); };
  N.showRewarded = function () {
    return new Promise(function (resolve) {
      var c = { earned: false, shown: false, done: false };
      c.finish = function (r) {
        if (c.done) return; c.done = true; if (RW === c) RW = null;
        rewardLoaded = false; setTimeout(loadReward, 300); resolve(r);
      };
      RW = c; rFails = 0;
      if (!N.ready) { N.lastAdError = N.lastAdError || 'ads still starting up'; return c.finish('unavailable'); }
      var step = 'load'; alog('tap: rewarded (' + (freshReward() ? 'preloaded' : 'not preloaded, loading now') + ')');
      // watchdog: whatever happens inside the ad SDK, hand the game back
      setTimeout(function () { if (!c.done && !c.shown && step === 'load') { noteErr('rewarded stuck at ' + step, 'no response'); c.finish('unavailable'); } }, 33000);
      // one automatic retry with a fresh ad before telling the player nothing is available
      var attempt = function (tries) {
        if (c.done || c.shown) return;
        if (!freshReward()) rewardLoaded = false;
        var ready = rewardLoaded ? Promise.resolve() : within(loadRewardP(), 14000);
        ready.then(function () {
          if (c.done || c.shown) return;
          step = 'show'; alog('calling show');
          var opened = false;
          AdMob.showRewardVideoAd()
            .then(function () { c.earned = true; setTimeout(function () { if (!c.done && !N.adOpen) c.finish('earned'); }, 1500); })
            .catch(function (e) { if (c.shown || opened || c.done) return; opened = true; noteErr('show rewarded', e); rewardLoaded = false; if (tries > 0) attempt(tries - 1); else c.finish('unavailable'); });
          setTimeout(function () { if (c.shown || c.done || opened || N.adOpen || document.hidden) return; opened = true; noteErr('show rewarded', 'ad did not open'); c.finish('unavailable'); }, 15000);
          setTimeout(function () { if (!c.done) c.finish(c.earned ? 'earned' : 'unavailable'); }, 180000);
        }).catch(function (e) { noteErr('load rewarded', e); rewardLoaded = false; if (tries > 0 && !c.done) setTimeout(function () { attempt(tries - 1); }, 800); else c.finish('unavailable'); });
      };
      attempt(1);
    });
  };

  // resolves when the ad is closed (or straight away if none is ready); never hangs
  N.showInterstitial = function () {
    return new Promise(function (resolve) {
      if (!N.ready || !interLoaded) { loadInter(); return resolve(false); }
      var c = { shown: false, done: false };
      c.finish = function (r) { if (c.done) return; c.done = true; if (IN === c) IN = null; interLoaded = false; setTimeout(loadInter, 500); resolve(r); };
      IN = c;
      AdMob.showInterstitial().catch(function (e) { noteErr('show interstitial', e); c.finish(false); });
      setTimeout(function () { if (!c.shown && !c.done) c.finish(false); }, 6000);
    });
  };
})();
