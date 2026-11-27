/* Jelly Jars 2.0 - ads (JJAds).
   - Rewarded: player opts in, reward shown before the ad. Placements: continue, double_beans.
   - Interstitial: only at result transitions (after the player has seen results and taps Next/Retry/Play again/Home),
     gated by active play time, result count, every-Nth eligible transition, cooldown, rolling cap, and skipped right after a rewarded ad.
   - Never: during play, tutorial, app launch/resume, banners.
   - Rules come from DEFAULTS, overridden by remote config (cached; applied without an app update).
   - Native: Google AdMob through the @capacitor-community/admob plugin (window.Capacitor.Plugins.AdMob).
     Dev build uses Google's demo ad units (always test ads). Production units come from PROD_UNITS, filled in at release.
   - Web dev build: a simulated ad screen, so every flow can be tested in a browser. Production web: no ads.
   Ads never block gameplay: if an ad is not loaded, the offer is simply not shown / the transition goes straight on. */
(function () {
  'use strict';
  const DEFAULTS = {
    ads_enabled: true,
    rv_continue_enabled: true, rv_continue_moves: 5,         // Journey out of moves: +5 moves
    rv_double_enabled: true,
    int_enabled: true,
    int_min_results: 2,          // results screens seen before the first interstitial
    int_min_active_sec: 330,     // ~5.5 min of actual play before the first interstitial
    int_every_n: 2,              // then every 2nd eligible results transition
    int_cooldown_sec: 180,       // at least 3 min between interstitials
    int_max_per_window: 3, int_window_sec: 1800, // max 3 per 30 min of session
    int_skip_after_rv_sec: 90,   // no interstitial within 90 s of a rewarded ad
    config_url: ''
  };
  // remote rules: dev builds read the dev file, the Play app reads its own file (so testing never changes live players)
  const URLS = { dev: 'https://meacrob.github.io/jellyjars2/ads-config.json', prod: 'https://meacrob.github.io/jellyjars/ads2.json' };
  // Google's public demo ad units (never earn, never risk the account)
  const TEST_UNITS = { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' };
  // the existing Jelly Jars 1.0 AdMob app (ca-app-pub-9018020377555599~2318372617) and its two live units, reused for 2.0
  const PROD_UNITS = { rewarded: 'ca-app-pub-9018020377555599/9566307240', interstitial: 'ca-app-pub-9018020377555599/6425138586' };
  const LS = 'jj2_ads_v1';

  let cfg = Object.assign({}, DEFAULTS), dev = false, testAds = false, noAds = false, rvAt = 0, showGuard = 0, track = () => {}, onFull = () => {}, native = null, units = null, consentOk = false;
  const st = { rv: { ready: false, loading: false, fails: 0 }, int: { ready: false, loading: false, fails: 0 } };
  let mem = { results: 0, eligible: 0, active: 0, lastInt: 0, ints: [], lastRv: 0, sessionStart: Date.now(), firstAdT: 0 };
  const S = { req: { rv: 0, int: 0 }, load: { rv: 0, int: 0 }, fail: { rv: 0, int: 0 }, imp: {}, rvOffer: {}, rvStart: {}, rvDone: {}, rvDeclined: {}, rev: { rv: [0, 0], int: [0, 0] }, cur: '' };
  let pendingPlacement = null, rvResolve = null, rvGot = false, intResolve = null;

  function loadMem() { try { const m = JSON.parse(localStorage.getItem(LS) || '{}'); if (m.cfg) Object.assign(cfg, m.cfg); } catch (e) {} }
  function saveCfg(c) { try { localStorage.setItem(LS, JSON.stringify({ cfg: c })); } catch (e) {} }
  async function fetchRemote() {
    try {
      const r = await fetch((dev ? URLS.dev : URLS.prod) + '?t=' + Math.floor(Date.now() / 600000), { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(), c = {}; for (const k of Object.keys(DEFAULTS)) if (k !== 'config_url' && typeof j[k] === typeof DEFAULTS[k]) c[k] = j[k];
      Object.assign(cfg, c); saveCfg(c); track('ads_config', { source: 'remote', keys: Object.keys(c).length });
    } catch (e) { track('ads_config', { source: 'cached_or_default', offline: navigator.onLine === false ? 1 : 0 }); } // offline: last good rules, else built-in defaults
  }

  // ---------- native AdMob ----------
  const P = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  async function initNative() {
    const A = P();
    const L = (ev, fn) => { try { A.addListener(ev, fn); } catch (e) {} };
    L('onRewardedVideoAdLoaded', () => { rvAt = Date.now(); st.rv.ready = true; st.rv.loading = false; st.rv.fails = 0; S.load.rv++; track('ad_loaded', { format: 'rewarded' }); });
    L('onRewardedVideoAdFailedToLoad', e => { st.rv.loading = false; st.rv.fails++; S.fail.rv++; track('ad_load_failed', { format: 'rewarded', code: e && e.code }); retry('rv'); });
    L('onRewardedVideoAdShowed', () => { clearTimeout(showGuard); S.rvStart[S.cur] = (S.rvStart[S.cur] || 0) + 1; track('rv_start', { placement: S.cur }); });
    L('onRewardedVideoAdImpression', d => impression('rewarded', d));
    L('onRewardedVideoAdReward', () => { rvGot = true; });
    L('onRewardedVideoAdFailedToShow', e => { track('ad_show_failed', { format: 'rewarded', code: e && e.code }); endRv(); });
    L('onRewardedVideoAdDismissed', () => setTimeout(endRv, 400)); // a late reward callback still counts
    L('interstitialAdLoaded', () => { st.int.ready = true; st.int.loading = false; st.int.fails = 0; S.load.int++; track('ad_loaded', { format: 'interstitial' }); });
    L('interstitialAdFailedToLoad', e => { st.int.loading = false; st.int.fails++; S.fail.int++; track('ad_load_failed', { format: 'interstitial', code: e && e.code }); retry('int'); });
    L('interstitialAdImpression', d => impression('interstitial', d));
    L('interstitialAdShowed', () => clearTimeout(showGuard));
    L('interstitialAdFailedToShow', e => { track('ad_show_failed', { format: 'interstitial', code: e && e.code }); endInt(); });
    L('interstitialAdDismissed', () => endInt());
    // consent first (Google UMP: shows the form only where the law requires it, e.g. EEA/UK)
    try {
      let info = await A.requestConsentInfo({});
      if (!info.canRequestAds && info.isConsentFormAvailable && info.status === 'REQUIRED') info = await A.showConsentForm();
      consentOk = info.canRequestAds !== false; S.consent = info.status; S.privacyBtn = info.privacyOptionsRequirementStatus === 'REQUIRED';
      track('consent', { status: info.status, can: consentOk });
    } catch (e) { consentOk = true; track('consent', { error: String(e && e.message || e).slice(0, 60) }); }
    if (!consentOk) return;
    // 1.0 lesson: initialize can report a failure while ads still work, so never let it block loading
    try { await Promise.race([A.initialize({ initializeForTesting: testAds }), new Promise(r => setTimeout(r, 15000))]); } catch (e) { track('ads_init_failed', { e: String(e && e.message || e).slice(0, 60) }); }
    load('rv'); setTimeout(() => load('int'), 4000);
  }
  function load(k) {
    if (!cfg.ads_enabled || !units || st[k].ready || st[k].loading) return;
    st[k].loading = true; S.req[k]++; track('ad_request', { format: k === 'rv' ? 'rewarded' : 'interstitial' });
    if (native) { const A = P(), o = { adId: k === 'rv' ? units.rewarded : units.interstitial, isTesting: testAds }; (k === 'rv' ? A.prepareRewardVideoAd(o) : A.prepareInterstitial(o)).catch(() => {}); }
    else setTimeout(() => { // simulated (browser dev only). window.JJ_SIM_FAIL = 'rv' | 'int' | 'all' makes loads fail, for testing
      st[k].loading = false; const f = window.JJ_SIM_FAIL;
      if (f === 'all' || f === k) { st[k].fails++; S.fail[k]++; track('ad_load_failed', { format: k === 'rv' ? 'rewarded' : 'interstitial', sim: 1 }); retry(k); return; }
      if (k === 'rv') rvAt = Date.now(); st[k].ready = true; S.load[k]++; track('ad_loaded', { format: k === 'rv' ? 'rewarded' : 'interstitial', sim: 1 }); }, 600);
  }
  function retry(k) { setTimeout(() => load(k), Math.min(300, 15 * Math.pow(2, st[k].fails)) * 1000); }
  function impression(format, d) {
    const p = S.cur || '?', v = d && d.valueMicros ? d.valueMicros / 1e6 : 0;
    S.imp[p] = (S.imp[p] || 0) + 1; const r = S.rev[format === 'rewarded' ? 'rv' : 'int']; r[0]++; r[1] += v;
    if (!mem.firstAdT) mem.firstAdT = Date.now();
    track('ad_shown', Object.assign({ format, placement: p, value: v, currency: d && d.currencyCode, precision: d && d.precision, network: d && d.networkName, secs_to_first_ad: Math.round((mem.firstAdT - mem.sessionStart) / 1000) }, pendingPlacement || {}));
  }
  function endRv() {
    clearTimeout(showGuard); if (!rvResolve) return; const got = rvGot, res = rvResolve; rvResolve = null; rvGot = false; st.rv.ready = false; onFull(false);
    if (got) { S.rvDone[S.cur] = (S.rvDone[S.cur] || 0) + 1; mem.lastRv = Date.now(); track('rv_complete', Object.assign({ placement: S.cur }, pendingPlacement)); }
    else track('rv_closed_early', { placement: S.cur });
    setTimeout(() => load('rv'), 1000); res({ rewarded: got });
  }
  function endInt() { clearTimeout(showGuard); if (!intResolve) return; const res = intResolve; intResolve = null; st.int.ready = false; onFull(false); setTimeout(() => load('int'), 1000); res(); }

  // ---------- simulated ad (web dev build only) ----------
  function simAd(kind) {
    const d = document.createElement('div'); d.id = 'simAd';
    d.style.cssText = 'position:fixed;inset:0;z-index:999;background:#222;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:700 20px Nunito,sans-serif;gap:16px;text-align:center';
    d.innerHTML = `<div style="opacity:.6;font-size:13px">SIMULATED ${kind === 'rv' ? 'REWARDED' : 'INTERSTITIAL'} AD (dev only)</div><div id="simT">Ad 3</div><button id="simX" class="btn small ghost" style="display:none">Close</button>${kind === 'rv' ? '<button id="simQ" class="btn small ghost">Close early (no reward)</button>' : ''}`;
    document.body.appendChild(d); let n = 3;
    if (kind === 'rv') { S.rvStart[S.cur] = (S.rvStart[S.cur] || 0) + 1; track('rv_start', { placement: S.cur }); }
    impression(kind === 'rv' ? 'rewarded' : 'interstitial', null);
    clearTimeout(showGuard); const iv = setInterval(() => { n--; d.querySelector('#simT').textContent = n > 0 ? 'Ad ' + n : 'Ad finished'; if (n <= 0) { clearInterval(iv); if (kind === 'rv') rvGot = true; d.querySelector('#simX').style.display = ''; if (window.JJBotOn) close(); } }, 1000);
    const close = () => { clearInterval(iv); d.remove(); kind === 'rv' ? endRv() : endInt(); };
    d.querySelector('#simX').onclick = close; const q = d.querySelector('#simQ'); if (q) q.onclick = close;
  }

  // ---------- public API ----------
  const Ads = {
    get cfg() { return cfg; },
    init(o) {
      dev = !!o.dev; testAds = dev || window.JJ_TEST_ADS === true; track = o.track || track; onFull = o.onFull || onFull; loadMem();
      native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && P());
      units = testAds ? TEST_UNITS : PROD_UNITS;
      if (!native && !dev) units = null; // production web: no ads
      fetchRemote();
      if (!units) { track('ads_off', { native, dev }); return; }
      if (native) initNative().catch(e => track('ads_init_failed', { e: String(e && e.message || e).slice(0, 80) }));
      else { consentOk = true; load('rv'); setTimeout(() => load('int'), 1500); }
    },
    on() { return !!units && cfg.ads_enabled && consentOk; },
    rvReady() { if (st.rv.ready && Date.now() - rvAt > 50 * 60000) { st.rv.ready = false; load('rv'); } return this.on() && st.rv.ready; }, // AdMob ads expire after an hour
    setNoAds(v) { noAds = !!v; },
    resumed() { if (!units) return; load('rv'); load('int'); },
    get testAds() { return testAds; },
    // player saw an offer
    offer(placement, ctx) { S.rvOffer[placement] = (S.rvOffer[placement] || 0) + 1; track('rv_offer', Object.assign({ placement }, ctx)); },
    declined(placement, ctx) { S.rvDeclined[placement] = (S.rvDeclined[placement] || 0) + 1; track('rv_declined', Object.assign({ placement }, ctx)); },
    showRewarded(placement, ctx) {
      return new Promise(res => {
        if (!this.rvReady()) { track('rv_unavailable', { placement }); load('rv'); return res({ rewarded: false, unavailable: true }); }
        S.cur = placement; pendingPlacement = ctx || {}; rvResolve = res; rvGot = false; onFull(true);
        track('rv_show', Object.assign({ placement }, ctx));
        showGuard = setTimeout(() => { track('ad_show_timeout', { format: 'rewarded' }); endRv(); }, 10000); // never left hanging if the ad screen does not open
        if (native) P().showRewardVideoAd().then(it => { if (it && it.amount != null) rvGot = true; }).catch(() => endRv()); else simAd('rv');
      });
    },
    // count actual play time (called by the game loop only while the player is actively playing)
    activeTick(sec) { mem.active += sec; },
    noteResult() { mem.results++; },
    // a results-screen transition: maybe show an interstitial, then continue. Never waits for loading.
    transition(placement, ctx) {
      return new Promise(res => {
        const now = Date.now(), why = this.intBlock(now);
        if (why) { if (why !== 'not_ready' || mem.results >= cfg.int_min_results) track('int_skipped', { placement, why }); return res(); }
        mem.eligible++;
        if (mem.eligible < cfg.int_every_n) { track('int_skipped', { placement, why: 'every_n', n: mem.eligible }); return res(); }
        mem.eligible = 0; mem.lastInt = now; mem.ints.push(now);
        S.cur = placement; pendingPlacement = ctx || {}; intResolve = res; onFull(true);
        track('int_show', Object.assign({ placement, active_min: Math.round(mem.active / 6) / 10 }, ctx));
        showGuard = setTimeout(() => { track('ad_show_timeout', { format: 'interstitial' }); endInt(); }, 10000);
        if (native) P().showInterstitial().catch(() => endInt()); else simAd('int');
      });
    },
    intBlock(now) {
      now = now || Date.now();
      if (!this.on() || !cfg.int_enabled) return 'off';
      if (noAds) return 'no_ads_purchase';
      if (mem.results < cfg.int_min_results) return 'min_results';
      if (mem.active < cfg.int_min_active_sec) return 'min_active';
      if (now - mem.lastRv < cfg.int_skip_after_rv_sec * 1000) return 'after_rewarded';
      if (now - mem.lastInt < cfg.int_cooldown_sec * 1000) return 'cooldown';
      mem.ints = mem.ints.filter(t => now - t < cfg.int_window_sec * 1000); if (mem.ints.length >= cfg.int_max_per_window) return 'window_cap';
      if (!st.int.ready) { load('int'); return 'not_ready'; }
      return '';
    },
    privacyRequired() { return !!S.privacyBtn; },
    showPrivacy() { if (native) P().showPrivacyOptionsForm().catch(() => {}); },
    report() {
      const sum = o => Object.values(o).reduce((a, b) => a + b, 0), pl = Object.keys(Object.assign({}, S.rvOffer, S.imp));
      const lines = [`mode ${native ? 'AdMob' : units ? 'simulated' : 'off'}${testAds ? ' (TEST ads)' : ' (LIVE ads)'}${noAds ? ' no-ads owner' : ''}  consent ${S.consent || '-'}  session ${Math.round((Date.now() - mem.sessionStart) / 60000)} min  active play ${Math.round(mem.active / 60)} min  first ad after ${mem.firstAdT ? Math.round((mem.firstAdT - mem.sessionStart) / 1000) + 's' : '-'}`,
        `requests rv ${S.req.rv} int ${S.req.int} | loaded rv ${S.load.rv} int ${S.load.int} | failed rv ${S.fail.rv} int ${S.fail.int}`,
        `results seen ${mem.results}  next interstitial: ${this.intBlock() || 'eligible (every ' + cfg.int_every_n + ', at ' + mem.eligible + ')'}`];
      for (const p of pl) { const o = S.rvOffer[p] || 0, s = S.rvStart[p] || 0, d = S.rvDone[p] || 0; lines.push(`${p}: impressions ${S.imp[p] || 0}${o ? `  offers ${o}  starts ${s}  completed ${d}  opt-in ${Math.round(s / o * 100)}%` : ''}`); }
      for (const k of ['rv', 'int']) { const [n, v] = S.rev[k]; if (n) lines.push(`${k === 'rv' ? 'rewarded' : 'interstitial'}: ${n} imp, est ${v.toFixed(4)} (eCPM ${(v / n * 1000).toFixed(2)})`); }
      lines.push('config ' + JSON.stringify(Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== 'config_url'))));
      return lines.join('\n') + (sum(S.imp) ? '' : '\n(no impressions yet)');
    },
    _mem: () => mem, _st: () => st
  };
  window.JJAds = Ads;
})();
