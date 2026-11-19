/* Ma semaine : sauvegarde automatique et synchronisation (Cloud Firestore), local-first.
   - Le stockage local reste la source de vérité de l'application ; le cloud est une copie par compte.
   - Sans compte connecté, ce fichier ne fait rien (il ne s'active que via MSSync.attach).
   - Une seule écriture groupée par rafale de modifications (3 s), en transaction : fusion avec le cloud puis écriture.
   - Aucune donnée de compte dans le cache Firestore du navigateur (mémoire seulement). */
(function () {
  "use strict";
  var C = window.MSCore;
  if (!C) return;

  var SYNC_KEY = "ma-semaine-sync", CONF_KEY = "ma-semaine-conflicts", PRE_KEY = "ma-semaine-premerge", VAULT = "ma-semaine-vault-";
  var MANAGED = C.RAW_KEYS, loadedAt = Date.now();
  var ctx = null, meta = null, running = false, rerun = false, timer = null, statusTimer = null, retryTimer = null, retryN = 0;
  var lastError = "", errCode = "", blocked = false, lastUserInput = 0, lastLocalWrite = 0, needReload = false;
  var listeners = [];

  /* ---------- stockage local (écritures internes sans déclencher la surveillance) ---------- */
  var origSet = Storage.prototype.setItem;
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) {
    try { if (v == null) localStorage.removeItem(k); else origSet.call(localStorage, k, v); return true; } catch (e) { return false; }
  }
  function readRaw() {
    var st = {};
    C.CLS.forEach(function (K) { st[K] = ls(C.STATE_KEY[K]); });
    return { cls: ls("ma-semaine-cls"), custom: ls("ma-semaine-custom"), profile: ls("ma-semaine-profile"), states: st };
  }
  function rawToMap(r) {
    var m = { "ma-semaine-cls": r.cls, "ma-semaine-custom": r.custom, "ma-semaine-profile": r.profile };
    C.CLS.forEach(function (K) { m[C.STATE_KEY[K]] = r.states[K]; });
    return m;
  }
  function writeRawMap(map, only) { Object.keys(only || map).forEach(function (k) { lset(k, map[k]); }); }
  function hasData(r) { return !!(r.cls || r.custom || r.profile || C.CLS.some(function (K) { return r.states[K]; })); }
  function flat() { return C.readFlat(readRaw()).leaves; }

  function loadMeta() {
    var m = null;
    try { m = JSON.parse(ls(SYNC_KEY)); } catch (e) {}
    meta = (m && typeof m === "object") ? m : {};
    meta.base = meta.base || {}; meta.ts = meta.ts || {}; meta.pend = meta.pend || {};
  }
  function saveMeta() { lset(SYNC_KEY, JSON.stringify(meta)); }

  /* ---------- statut ---------- */
  function dirty() {
    var cur = flat(), b = meta ? meta.base : {}, keys = {};
    Object.keys(cur).forEach(function (k) { keys[k] = 1; }); Object.keys(b).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).some(function (k) { return !meta.pend[k] && !C.eq(cur[k], b[k]); });
  }
  function conflictCount() { try { return (JSON.parse(ls(CONF_KEY)) || []).length; } catch (e) { return 0; } }
  function status() {
    var s = { state: "off", lastSync: 0, applyPending: false, message: "", conflicts: conflictCount(), offline: navigator.onLine === false };
    if (!ctx) return s;
    s.lastSync = meta.lastSync || 0;
    s.applyPending = Object.keys(meta.pend).length > 0;
    if (running) { s.state = "syncing"; return s; }
    if (lastError) { s.state = "error"; s.message = lastError; return s; }
    if (dirty()) { s.state = "pending"; s.message = s.offline ? "Hors connexion : tes modifications seront envoyées au retour du réseau." : "Envoi en attente."; return s; }
    s.state = "synced";
    return s;
  }
  function emit() {
    var s = status();
    listeners.forEach(function (f) { try { f(s); } catch (e) {} });
  }
  function soonStatus() { clearTimeout(statusTimer); statusTimer = setTimeout(emit, 250); }

  /* ---------- surveillance des écritures locales ---------- */
  Storage.prototype.setItem = function (k) {
    if (this === localStorage && MANAGED.indexOf(k) >= 0) {
      if (blocked) return; /* session en cours de fermeture ou de mise à jour : rien ne doit réécrire les données */
      var r = origSet.apply(this, arguments);
      onLocalWrite();
      return r;
    }
    return origSet.apply(this, arguments);
  };
  function onLocalWrite() {
    if (!ctx) return;
    lastLocalWrite = Date.now();
    soonStatus();
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow("local"); }, 3000);
  }
  ["pointerdown", "keydown", "input"].forEach(function (e) { document.addEventListener(e, function () { lastUserInput = Date.now(); }, true); });

  /* Horodate les feuilles modifiées localement (sert à départager un conflit). */
  function observeLocal() {
    var cur = flat(), obs = meta.obs, now = Date.now();
    if (obs) {
      var keys = {};
      Object.keys(cur).forEach(function (k) { keys[k] = 1; }); Object.keys(obs).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) { if (!C.eq(cur[k], obs[k])) meta.ts[k] = now; });
    }
    meta.obs = cur;
    saveMeta();
  }

  /* ---------- copies de sécurité ---------- */
  function addConflicts(list) {
    if (!list || !list.length) return;
    var all = [];
    try { all = JSON.parse(ls(CONF_KEY)) || []; } catch (e) {}
    list.forEach(function (c) { all.push({ at: c.at, key: C.parts(c.key).join(" / "), kept: c.kept, local: c.local, remote: c.remote, note: c.note || "" }); });
    lset(CONF_KEY, JSON.stringify(all.slice(-40)));
  }
  function premergeBackup(uid) {
    var r = readRaw();
    if (hasData(r) && !ls(PRE_KEY)) lset(PRE_KEY, JSON.stringify({ at: Date.now(), uid: uid, raw: r }));
  }
  function downloadBackups() {
    var out = { exporteLe: new Date().toISOString(), avantPremiereFusion: null, versionsMisesDeCote: [] };
    try { out.avantPremiereFusion = JSON.parse(ls(PRE_KEY)); } catch (e) {}
    try { out.versionsMisesDeCote = JSON.parse(ls(CONF_KEY)) || []; } catch (e) {}
    var b = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = "ma-semaine-copies-de-securite.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- erreurs ---------- */
  function handleError(e) {
    var code = (e && e.code) || "", msg = String((e && e.message) || "");
    errCode = code;
    if (code === "permission-denied" || /insufficient permissions/i.test(msg)) lastError = "Accès refusé par Firebase : les règles de sécurité Firestore ne sont pas publiées ou ne correspondent pas.";
    else if (code === "not-found" || /does not exist|not been used|disabled/i.test(msg)) lastError = "Cloud Firestore n'est pas encore créé ou activé dans le projet Firebase.";
    else if (code === "too-big") lastError = "Trop de données pour la sauvegarde cloud. Tes données restent enregistrées sur ce téléphone.";
    else if (code === "verify") lastError = "La vérification après envoi a échoué. Tes données locales sont intactes ; nouvelle tentative prévue.";
    else if (navigator.onLine === false || code === "unavailable" || code === "timeout" || code === "deadline-exceeded" || code === "aborted") lastError = "Cloud injoignable pour le moment. Tes données restent sur ce téléphone ; nouvelle tentative automatique.";
    else lastError = "Erreur de synchronisation. Tes données restent sur ce téléphone ; nouvelle tentative automatique.";
    var wait = [5000, 15000, 45000, 120000, 300000][Math.min(retryN, 4)];
    retryN++;
    clearTimeout(retryTimer);
    if (code !== "permission-denied" && code !== "too-big") retryTimer = setTimeout(function () { syncNow("retry"); }, wait);
  }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej({ code: "timeout" }); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  /* ---------- synchronisation ---------- */
  function syncNow(reason) {
    if (!ctx) return Promise.resolve();
    if (running) { rerun = true; return ctx.idle; }
    if (navigator.onLine === false) { emit(); return Promise.resolve(); }
    var c = ctx, uid = c.uid, firstTime = !meta.migrated;
    running = true; lastError = ""; emit();
    ctx.idle = (async function () {
      try {
        observeLocal();
        var out = await withTimeout(c.sdk.runTransaction(c.db, async function (tx) {
          var snap = await tx.get(c.ref);
          var data = snap.exists() ? snap.data() : null;
          var rem = C.fromRemote((data && data.leaves) || {});
          var used = flat();
          var m = C.merge({ local: used, base: meta.base, remote: rem.entries, ts: meta.ts, now: Date.now() });
          if (m.tooBig) throw { code: "too-big" };
          var rev = (data && typeof data.rev === "number") ? data.rev : 0, wrote = false;
          if (m.remoteDirty || rem.dropped) {
            rev += 1; wrote = true;
            tx.set(c.ref, { v: 1, leaves: C.toRemote(m.entries), rev: rev, updatedAt: c.sdk.serverTimestamp() });
          }
          return { m: m, used: used, rev: rev, wrote: wrote };
        }), 25000);
        if (!ctx || ctx.uid !== uid) return;
        if (firstTime) await verifyMigration(c, out.m);
        c.lastRev = out.rev;
        addConflicts(out.m.conflicts);
        var cur = flat();
        meta.base = C.advanceBase(meta.base, out.m);
        Object.keys(meta.ts).forEach(function (k) { if (!out.m.remoteWin[k] && C.eq(cur[k], out.used[k])) delete meta.ts[k]; });
        meta.pend = {};
        Object.keys(out.m.remoteWin).forEach(function (k) { meta.pend[k] = { from: out.used[k], to: out.m.merged[k] }; });
        meta.rev = out.rev; meta.lastSync = Date.now(); meta.migrated = true; meta.owner = uid;
        saveMeta();
        retryN = 0;
        running = false;
        if (Object.keys(meta.pend).length || needReload) applyDecision(firstTime);
      } catch (e) {
        handleError(e);
      } finally {
        running = false;
        emit();
        if (rerun) { rerun = false; setTimeout(function () { syncNow("rerun"); }, 400); }
        else if (ctx && !lastError && dirty()) onLocalWrite();
      }
    })();
    return ctx.idle;
  }

  /* Après la toute première fusion : relit le cloud et vérifie que chaque donnée y est bien. */
  async function verifyMigration(c, m) {
    var snap = await withTimeout(c.sdk.getDocFromServer(c.ref), 20000);
    var got = C.fromRemote(snap.exists() ? (snap.data().leaves || {}) : {}).entries;
    var bad = Object.keys(m.entries).filter(function (k) {
      var e = m.entries[k];
      return e && !e.d && !(got[k] && !got[k].d && C.eq(got[k].v, e.v));
    });
    if (bad.length) throw { code: "verify", message: bad.length + " éléments non retrouvés" };
  }

  /* ---------- application du cloud vers le stockage local ---------- */
  function reloadGuard() {
    try {
      var a = JSON.parse(sessionStorage.getItem("ms-reloads") || "[]").filter(function (t) { return Date.now() - t < 60000; });
      if (a.length >= 3) return true;
      a.push(Date.now()); sessionStorage.setItem("ms-reloads", JSON.stringify(a));
    } catch (e) {}
    return false;
  }
  function applyDecision(first) {
    var idle = Date.now() - lastUserInput > 6000 && Date.now() - lastLocalWrite > 6000;
    var fresh = Date.now() - loadedAt < 15000 && !lastUserInput;
    if (first || fresh || (idle && document.visibilityState === "hidden")) applyNow();
    else emit();
  }
  /* Recalcule à partir du stockage actuel : une modification faite entre-temps n'est jamais écrasée. */
  function applyNow() {
    if (!ctx) return false;
    var pend = meta.pend || {};
    if (!Object.keys(pend).length && !needReload) return false;
    if (reloadGuard()) { lastError = "Mise à jour répétée : recharge l'application manuellement."; emit(); return false; }
    var raw = readRaw(), cur = C.readFlat(raw).leaves;
    Object.keys(pend).forEach(function (k) {
      if (!C.eq(cur[k], pend[k].from)) return; /* modifié entre-temps : on garde la version locale */
      if (pend[k].to === undefined) delete cur[k]; else cur[k] = pend[k].to;
      if (pend[k].to === undefined) delete meta.base[k]; else meta.base[k] = pend[k].to;
    });
    var a = C.applyFlat(cur, raw, Date.now());
    blocked = true;
    var map = rawToMap(a.raw), ch = {};
    Object.keys(a.changed).forEach(function (k) { ch[k] = map[k]; });
    writeRawMap(map, ch);
    meta.pend = {}; meta.obs = flat(); saveMeta();
    needReload = false;
    setTimeout(function () { blocked = false; }, 4000);
    location.reload();
    return true;
  }

  /* ---------- isolation des comptes ---------- */
  function wipeLocal() {
    MANAGED.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    [SYNC_KEY, CONF_KEY, PRE_KEY].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    try { sessionStorage.removeItem("ms-reloads"); } catch (e) {}
  }
  function vaultCurrent(uid) {
    return lset(VAULT + uid, JSON.stringify({ at: Date.now(), raw: readRaw(), meta: meta }));
  }
  /* Restaure ce qui avait été mis à l'abri pour ce compte (modifications jamais envoyées) et le fusionne sans rien écraser. */
  function restoreVault(uid) {
    var v = null;
    try { v = JSON.parse(ls(VAULT + uid)); } catch (e) {}
    if (!v || !v.raw) return;
    var vf = C.readFlat(v.raw).leaves, ent = {};
    Object.keys(vf).forEach(function (k) { ent[k] = { v: vf[k], t: v.at || 1 }; });
    var raw = readRaw();
    var m = C.merge({ local: C.readFlat(raw).leaves, base: {}, remote: ent, ts: {}, now: Date.now() });
    var a = C.applyFlat(m.merged, raw, Date.now()), map = rawToMap(a.raw), ch = {};
    Object.keys(a.changed).forEach(function (k) { ch[k] = map[k]; });
    writeRawMap(map, ch);
    addConflicts(m.conflicts);
    try { localStorage.removeItem(VAULT + uid); } catch (e) {}
    needReload = Object.keys(a.changed).length > 0;
  }

  function attach(o) {
    if (ctx && ctx.uid === o.user.uid) return;
    detach();
    loadMeta();
    var uid = o.user.uid;
    if (meta.owner && meta.owner !== uid) { /* données d'un autre compte encore présentes : on les met à l'abri, jamais mélangées */
      if (dirty()) vaultCurrent(meta.owner);
      wipeLocal(); loadMeta(); needReload = true;
    }
    var db = o.sdk.getFirestore(o.app);
    ctx = { sdk: o.sdk, db: db, uid: uid, ref: o.sdk.doc(db, "users", uid, "sync", "state"), lastRev: -1, idle: Promise.resolve(), unsub: null };
    if (!meta.owner) {
      premergeBackup(uid);
      meta.base = {}; meta.ts = {}; meta.obs = null; meta.pend = {}; meta.migrated = false;
      restoreVault(uid);
    }
    meta.owner = uid; saveMeta();
    ctx.unsub = o.sdk.onSnapshot(ctx.ref, function (snap) {
      if (snap.metadata.hasPendingWrites) return;
      var rev = snap.exists() ? snap.data().rev : 0;
      if (rev !== meta.rev && rev !== ctx.lastRev) { clearTimeout(timer); timer = setTimeout(function () { syncNow("remote"); }, 800); }
    }, function (e) { handleError(e); emit(); });
    emit();
    syncNow("start");
  }
  function detach() {
    if (ctx && ctx.unsub) { try { ctx.unsub(); } catch (e) {} }
    ctx = null; clearTimeout(timer); clearTimeout(retryTimer); lastError = ""; running = false; rerun = false;
    emit();
  }

  /* Déconnexion sûre : envoie ce qui reste, met à l'abri ce qui n'a pas pu l'être, retire les données de l'appareil. */
  async function signOutSafe() {
    var res = { ok: true, vaulted: false };
    if (ctx) {
      try { if (running) await ctx.idle; else if (navigator.onLine !== false) await syncNow("signout"); } catch (e) {}
      observeLocal();
      if (dirty()) {
        if (!vaultCurrent(ctx.uid)) return { ok: false, reason: "vault" };
        res.vaulted = true;
      }
    }
    if (ctx && ctx.unsub) { try { ctx.unsub(); } catch (e) {} }
    blocked = true;
    wipeLocal();
    ctx = null; clearTimeout(timer); clearTimeout(retryTimer);
    return res;
  }

  /* ---------- déclencheurs ---------- */
  window.addEventListener("online", function () { retryN = 0; if (ctx) syncNow("online"); else emit(); });
  window.addEventListener("offline", function () { emit(); });
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.visibilityState === "hidden") {
      clearTimeout(timer); observeLocal();
      if (Object.keys(meta.pend).length) applyNow(); else if (dirty()) syncNow("hidden");
    } else if (Date.now() - (meta.lastSync || 0) > 60000) syncNow("visible");
  });
  setInterval(function () { if (ctx && !running && document.visibilityState === "visible" && (dirty() || Date.now() - (meta.lastSync || 0) > 600000)) syncNow("interval"); }, 60000);

  window.MSSync = {
    attach: attach, detach: detach, syncNow: syncNow, applyNow: applyNow, signOutSafe: signOutSafe, downloadBackups: downloadBackups,
    status: status, onStatus: function (f) { listeners.push(f); }
  };
})();
