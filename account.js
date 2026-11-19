/* Ma semaine : compte Google facultatif + profil étudiant (mission 1).
   - Sans compte (ou Firebase non configuré) : rien ne change pour l'application.
   - Firebase Auth est chargé à la demande depuis vendor/firebase (aucun code tiers).
   - Le profil (université, promotion) est gardé sur l'appareil : clé « ma-semaine-profile ».
   Ce fichier ne touche à aucune autre donnée locale. */
(function () {
  "use strict";
  var PROFILE_KEY = "ma-semaine-profile";
  var cfg = window.MS_FIREBASE_CONFIG || {};
  var configured = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

  var sdk = null, auth = null, appRef = null, user = null, ready = false, busy = false, lastErr = "", sdkFailed = false, confirming = false, outBusy = false;
  var opener = null;

  /* ---------- profil local ---------- */
  function readProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (p && typeof p === "object") return { university: String(p.university || ""), level: String(p.level || "") };
    } catch (e) {}
    return { university: "", level: "" };
  }
  function writeProfile(p) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ university: p.university, level: p.level, updatedAt: Date.now() }));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- petits utilitaires DOM ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var GOOGLE_G = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.6 14.6a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7l3.8 3C6.5 6.8 9 4.8 12 4.8z"/></svg>';
  var PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6"/></svg>';

  /* ---------- bouton d'en-tête ---------- */
  var btn = el("button", { "class": "icon-btn", id: "acct-btn", type: "button", "aria-haspopup": "dialog", "aria-label": "Mon compte" });
  btn.innerHTML = PERSON;
  var tools = document.querySelector(".tools");
  if (!tools) return; /* structure inattendue : on ne touche à rien */
  tools.appendChild(btn);

  function avatarNode(size) {
    var wrap;
    var name = (user && (user.displayName || user.email)) || "";
    if (user && user.photoURL) {
      wrap = el("img", { "class": "acct-av", alt: "", referrerpolicy: "no-referrer", src: user.photoURL });
      wrap.addEventListener("error", function () {
        var f = el("span", { "class": "acct-av", "aria-hidden": "true", text: (name.charAt(0) || "?").toUpperCase() });
        if (wrap.parentNode) wrap.parentNode.replaceChild(f, wrap);
      });
    } else {
      wrap = el("span", { "class": "acct-av", "aria-hidden": "true", text: (name.charAt(0) || "?").toUpperCase() });
    }
    return wrap;
  }
  function refreshButton() {
    btn.innerHTML = "";
    btn.className = "icon-btn" + (user ? " has-user" : "");
    if (user && user.photoURL) {
      var im = el("img", { alt: "", referrerpolicy: "no-referrer", src: user.photoURL });
      im.addEventListener("error", function () { btn.className = "icon-btn has-user"; btn.textContent = initial(); });
      btn.className = "icon-btn";
      btn.appendChild(im);
    } else if (user) btn.textContent = initial();
    else btn.innerHTML = PERSON;
    btn.setAttribute("aria-label", user ? "Mon compte, connecté : " + (user.displayName || user.email || "Google") : "Mon compte");
  }
  function initial() { return ((user && (user.displayName || user.email)) || "?").charAt(0).toUpperCase(); }

  /* ---------- fenêtre « Mon compte » (même style que l'import d'horaire) ---------- */
  var overlay = el("div", { "class": "imp", id: "acct", role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-title", hidden: "" });
  var box = el("div", { "class": "imp-box" });
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function open() {
    opener = document.activeElement;
    overlay.hidden = false;
    render();
    ensureSdk();
    var f = box.querySelector("button:not([disabled]), input");
    if (f) f.focus();
  }
  function close() {
    overlay.hidden = true;
    if (opener && opener.focus) opener.focus();
  }
  /* Échap ferme la fenêtre même si le focus n'est pas à l'intérieur */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) { e.preventDefault(); close(); }
  }, true);
  btn.addEventListener("click", open);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", function (e) {
    e.stopPropagation(); /* évite les raccourcis de l'application derrière la fenêtre */
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { /* le focus reste dans la fenêtre */
      var f = Array.prototype.slice.call(box.querySelectorAll("button:not([disabled]), input, a[href]"));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function header() {
    var x = el("button", { type: "button", "class": "btn imp-x", text: "Fermer" });
    x.addEventListener("click", close);
    return [el("h2", { id: "acct-title", text: "Mon compte" }), x];
  }

  function render() {
    box.innerHTML = "";
    var h = header();
    box.appendChild(h[0]);
    if (user) renderSignedIn();
    else renderSignedOut();
    if (!(user && (confirming || outBusy))) box.appendChild(appearanceCard());
    box.appendChild(h[1]);
  }

  /* ---------- Apparence : pilote le bouton de thème existant (même réglage, même sauvegarde) ---------- */
  var THEMES = [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]];
  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    return t === "light" || t === "dark" ? t : "auto";
  }
  function setTheme(target) {
    var order = ["auto", "light", "dark"], btnT = document.getElementById("theme");
    if (!btnT) return;
    var steps = (order.indexOf(target) - order.indexOf(currentTheme()) + 3) % 3;
    for (var k = 0; k < steps; k++) btnT.click();
    render();
  }
  function appearanceCard() {
    var cur = currentTheme();
    var seg = el("div", { "class": "seg-ctl acct-theme", role: "group", "aria-label": "Apparence" });
    THEMES.forEach(function (t) {
      var b = el("button", { type: "button", "aria-pressed": String(t[0] === cur), text: t[1] });
      b.addEventListener("click", function () { if (t[0] !== currentTheme()) setTheme(t[0]); });
      seg.appendChild(b);
    });
    return el("div", { "class": "card" }, [
      el("h3", { text: "Apparence" }),
      seg,
      el("p", { "class": "imp-warn", text: "Automatique suit le réglage clair ou sombre de ton téléphone." })
    ]);
  }

  function renderSignedOut() {
    box.appendChild(el("p", { "class": "imp-p", text: "Le compte est facultatif. Sans compte, tout fonctionne et tes données restent sur ce téléphone." }));
    var status = el("p", { "class": "imp-err", id: "acct-msg", role: "alert", text: lastErr });
    if (!configured) {
      box.appendChild(el("p", { "class": "imp-p imp-warn", text: "La connexion Google n'est pas encore activée sur cette version de l'application. Tu peux continuer à l'utiliser normalement." }));
      var off = el("button", { type: "button", "class": "btn gbtn", disabled: "" });
      off.innerHTML = GOOGLE_G + "<span>Continuer avec Google</span>";
      box.appendChild(off);
      return;
    }
    var go = el("button", { type: "button", "class": "btn gbtn", id: "acct-go" });
    go.innerHTML = GOOGLE_G + "<span>" + (busy ? "Connexion en cours…" : "Continuer avec Google") + "</span>";
    if (busy || (!ready && !sdkFailed)) go.disabled = true;
    go.addEventListener("click", signIn);
    box.appendChild(go);
    if (sdkFailed) {
      var retry = el("button", { type: "button", "class": "link-btn", text: "Réessayer" });
      retry.addEventListener("click", function () { sdkFailed = false; lastErr = ""; render(); ensureSdk(); });
      box.appendChild(retry);
    }
    box.appendChild(status);
  }

  function renderSignedIn() {
    var idBlock = el("div", { "class": "acct-id" }, [
      avatarNode(),
      el("div", {}, [
        el("b", { text: user.displayName || "Compte Google" }),
        el("span", { text: user.email || "" })
      ])
    ]);
    box.appendChild(idBlock);

    var p = readProfile();
    var u = el("input", { type: "text", id: "acct-uni", maxlength: "80", autocomplete: "organization", placeholder: "Ex. : Université de Kinshasa", value: p.university });
    var l = el("input", { type: "text", id: "acct-lvl", maxlength: "40", autocomplete: "off", placeholder: "Ex. : L1 LMD, promotion 2026", value: p.level, list: "acct-lvls" });
    var dl = el("datalist", { id: "acct-lvls" });
    ["L1 LMD", "L2 LMD", "L3 LMD", "M1", "M2", "Doctorat"].forEach(function (t) { dl.appendChild(el("option", { value: t })); });
    var card = el("div", { "class": "card" }, [
      el("h3", { text: "Profil étudiant" }),
      el("div", { "class": "acct-f" }, [el("label", { "for": "acct-uni", text: "Université" }), u]),
      el("div", { "class": "acct-f" }, [el("label", { "for": "acct-lvl", text: "Promotion ou niveau d'études" }), l, dl]),
      el("p", { "class": "imp-warn", text: "Ces deux informations ne viennent pas de Google. Elles sont enregistrées dans ton compte et gardées sur cet appareil." })
    ]);
    box.appendChild(card);
    if (window.MSSync) box.appendChild(syncCard());

    var msg = el("p", { "class": "imp-ok", id: "acct-saved", role: "status" });
    var save = el("button", { type: "button", "class": "btn primary", text: "Enregistrer" });
    var out = el("button", { type: "button", "class": "btn", text: "Se déconnecter" });
    save.addEventListener("click", function () {
      var ok = writeProfile({ university: u.value.trim().slice(0, 80), level: l.value.trim().slice(0, 40) });
      msg.className = ok ? "imp-ok" : "imp-err";
      msg.textContent = ok ? "Profil enregistré." : "Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué).";
    });
    out.addEventListener("click", function () { confirming = true; lastErr = ""; render(); });
    if (confirming) { box.appendChild(confirmCard()); return; }
    box.appendChild(el("div", { "class": "imp-btns" }, [save, out]));
    box.appendChild(msg);
    box.appendChild(el("p", { "class": "imp-err", id: "acct-msg", role: "alert", text: lastErr }));
  }

  /* ---------- Firebase Auth (chargé à la demande) ---------- */
  function ensureSdk() {
    if (!configured || sdk || sdkFailed || ensureSdk.loading) return;
    ensureSdk.loading = true;
    import("./vendor/firebase/firebase-auth.js").then(function (m) {
      sdk = m;
      var app = m.initializeApp({
        apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId,
        storageBucket: cfg.storageBucket || undefined, messagingSenderId: cfg.messagingSenderId || undefined, appId: cfg.appId
      });
      appRef = app;
      auth = m.getAuth(app);
      auth.languageCode = "fr";
      return m.setPersistence(auth, m.browserLocalPersistence).catch(function () { /* persistance par défaut */ }).then(function () {
        m.onAuthStateChanged(auth, function (u) {
          user = u || null; ready = true; busy = false;
          if (u) { lastErr = ""; if (window.MSSync) window.MSSync.attach({ sdk: sdk, app: appRef, user: u }); }
          else { confirming = false; if (window.MSSync) window.MSSync.detach(); }
          refreshButton();
          if (!overlay.hidden) render();
        }, function () {
          ready = true; busy = false; lastErr = "Impossible de vérifier ta session pour le moment.";
          if (!overlay.hidden) render();
        });
      });
    }).catch(function () {
      sdk = null; sdkFailed = true; ready = false;
      lastErr = navigator.onLine === false
        ? "Pas de connexion internet : le compte Google n'est pas disponible pour l'instant. L'application reste utilisable."
        : "Le module de connexion n'a pas pu se charger. L'application reste utilisable.";
      if (!overlay.hidden) render();
    }).then(function () { ensureSdk.loading = false; });
  }

  var ERR = {
    "auth/popup-closed-by-user": "",
    "auth/cancelled-popup-request": "",
    "auth/user-cancelled": "",
    "auth/popup-blocked": "Le navigateur a bloqué la fenêtre de connexion. Autorise les fenêtres pop-up pour ce site, puis réessaie.",
    "auth/network-request-failed": "Connexion internet indisponible. Réessaie quand le réseau est revenu.",
    "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase (domaines autorisés). La connexion n'est pas possible pour l'instant.",
    "auth/operation-not-allowed": "La connexion Google n'est pas activée dans Firebase pour ce projet.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
    "auth/user-disabled": "Ce compte Google est désactivé pour cette application.",
    "auth/web-storage-unsupported": "Ce navigateur bloque le stockage nécessaire à la connexion. Vérifie les réglages de confidentialité."
  };

  function signIn() {
    if (!sdk || !auth || busy) return;
    if (navigator.onLine === false) { lastErr = ERR["auth/network-request-failed"]; render(); return; }
    busy = true; lastErr = ""; render();
    var provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    sdk.signInWithPopup(auth, provider).then(function () {
      /* onAuthStateChanged met l'interface à jour */
    }).catch(function (e) {
      busy = false;
      var c = e && e.code;
      lastErr = (c in ERR) ? ERR[c] : "La connexion a échoué. Réessaie dans un instant.";
      if (!overlay.hidden) render();
    });
  }

  function confirmCard() {
    var st = window.MSSync ? window.MSSync.status() : { state: "synced" };
    var unsent = st.state === "pending" || st.state === "error";
    var go = el("button", { type: "button", "class": "btn primary", id: "acct-out-ok", text: outBusy ? "Déconnexion…" : "Se déconnecter" });
    var no = el("button", { type: "button", "class": "btn", text: "Annuler" });
    if (outBusy) { go.disabled = true; no.disabled = true; }
    go.addEventListener("click", doSignOut);
    no.addEventListener("click", function () { confirming = false; render(); });
    return el("div", { "class": "card" }, [
      el("h3", { text: "Se déconnecter ?" }),
      el("p", { "class": "imp-p", text: "Ton compte et ses données restent intacts dans le cloud : tu les retrouveras en te reconnectant. Elles seront retirées de ce téléphone pour que personne d'autre ne puisse les voir." }),
      unsent ? el("p", { "class": "imp-p imp-warn", text: "Certaines modifications n'ont pas encore été envoyées. Elles seront mises à l'abri sur ce téléphone et rejointes à ta prochaine connexion avec ce compte." }) : null,
      el("div", { "class": "imp-btns" }, [go, no])
    ]);
  }

  function doSignOut() {
    if (outBusy) return;
    outBusy = true; render();
    Promise.resolve(window.MSSync ? window.MSSync.signOutSafe() : { ok: true }).then(function (r) {
      if (!r || !r.ok) {
        outBusy = false; confirming = false;
        lastErr = "Impossible de mettre tes modifications à l'abri (stockage plein). Déconnexion annulée : rien n'a été supprimé.";
        render(); return;
      }
      return Promise.resolve(sdk && auth ? sdk.signOut(auth) : null).catch(function () { /* données déjà retirées de l'appareil */ }).then(function () { location.reload(); });
    });
  }

  /* ---------- carte « Sauvegarde » ---------- */
  var SYNC_TXT = { synced: "Synchronisé", syncing: "Synchronisation en cours…", pending: "Modifications en attente", error: "Erreur de synchronisation" };
  function syncCard() {
    var card = el("div", { "class": "card", id: "acct-sync" }, [
      el("h3", { text: "Sauvegarde" }),
      el("p", { "class": "sync-line", id: "acct-sync-line", role: "status", "aria-live": "polite" }),
      el("p", { "class": "imp-warn", id: "acct-sync-sub" }),
      el("div", { "class": "imp-btns", id: "acct-sync-btns" })
    ]);
    setTimeout(function () { paintSync(window.MSSync.status()); }, 0);
    return card;
  }
  function paintSync(s) {
    var line = box.querySelector("#acct-sync-line"), sub = box.querySelector("#acct-sync-sub"), btns = box.querySelector("#acct-sync-btns");
    if (!line || !sub || !btns) return;
    line.innerHTML = "";
    line.appendChild(el("span", { "class": "sync-dot sync-" + s.state, "aria-hidden": "true" }));
    line.appendChild(el("b", { text: SYNC_TXT[s.state] || "Sauvegarde" }));
    var d = s.lastSync ? new Date(s.lastSync) : null;
    var parts = [];
    if (s.message) parts.push(s.message);
    if (d) parts.push("Dernière synchronisation réussie : " + d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ".");
    else if (s.state !== "syncing") parts.push("Aucune synchronisation réussie pour l'instant.");
    if (s.conflicts) parts.push(s.conflicts + " version" + (s.conflicts > 1 ? "s" : "") + " mise" + (s.conflicts > 1 ? "s" : "") + " de côté lors d'une fusion.");
    sub.textContent = parts.join(" ");
    btns.innerHTML = "";
    var now = el("button", { type: "button", "class": "btn", text: "Synchroniser maintenant" });
    if (s.state === "syncing" || s.offline) now.disabled = true;
    now.addEventListener("click", function () { window.MSSync.syncNow("manual"); });
    btns.appendChild(now);
    if (s.applyPending) {
      var ap = el("button", { type: "button", "class": "btn primary", text: "Appliquer les mises à jour" });
      ap.addEventListener("click", function () { window.MSSync.applyNow(); });
      btns.appendChild(ap);
    }
    if (s.conflicts) {
      var dl = el("button", { type: "button", "class": "btn", text: "Copies de sécurité" });
      dl.addEventListener("click", function () { window.MSSync.downloadBackups(); });
      btns.appendChild(dl);
    }
  }
  if (window.MSSync) window.MSSync.onStatus(function (s) { if (!overlay.hidden && user) paintSync(s); });

  /* Restaure la session sans gêner le démarrage de l'application */
  if (configured) {
    var kick = function () { ensureSdk(); };
    if ("requestIdleCallback" in window) requestIdleCallback(kick, { timeout: 4000 });
    else setTimeout(kick, 1500);
  }
})();
