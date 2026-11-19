/* Ma semaine : moteur de fusion des données (pur, sans réseau ni DOM).
   Les données locales sont aplaties en « feuilles » (une valeur par élément ou champ),
   puis fusionnées à trois voies : local, dernière version synchronisée (base), cloud.
   Aucune suppression silencieuse : en cas de conflit on garde la donnée et on met l'autre version de côté. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MSCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CLS = ["A", "B", "C"];
  var STATE_KEY = { A: "l1a-planner-v2", B: "l1b-planner-v2", C: "l1c-planner-v2" };
  var RAW_KEYS = ["ma-semaine-cls", "ma-semaine-custom", "ma-semaine-profile"].concat(CLS.map(function (c) { return STATE_KEY[c]; }));
  var TOMB_MS = 180 * 24 * 3600 * 1000;
  var MAX_LEAVES = 3000;

  /* ---------- clés de feuilles ---------- */
  function enc(p) { return encodeURIComponent(String(p)).replace(/~/g, "%7E").replace(/\./g, "%2E").replace(/\*/g, "%2A"); }
  function lk() { return Array.prototype.map.call(arguments, enc).join("~"); }
  function parts(k) { return k.split("~").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }); }

  function stable(v) {
    if (v === undefined) return "u";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
  }
  function eq(a, b) { return stable(a) === stable(b); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function parseObj(s) {
    if (s == null) return { ok: true, v: null };
    try { var o = JSON.parse(s); return (o && typeof o === "object" && !Array.isArray(o)) ? { ok: true, v: o } : { ok: false }; }
    catch (e) { return { ok: false }; }
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  /* ---------- données locales -> feuilles ---------- */
  function flattenState(K, s, out) {
    if (typeof s.note === "string" && s.note) out[lk("s", K, "note")] = s.note;
    if (typeof s.eoe === "string" && s.eoe) out[lk("s", K, "eoe")] = s.eoe;
    if (typeof s.theme === "string" && s.theme && s.theme !== "auto") out[lk("s", K, "theme")] = s.theme;
    if (typeof s.icsRem === "number" && s.icsRem) out[lk("s", K, "icsRem")] = s.icsRem;
    if (s.tm && typeof s.tm === "object") out[lk("s", K, "tm")] = { p: s.tm.p, w: s.tm.w, r: s.tm.r };
    ["q", "off", "offDay"].forEach(function (f) {
      var m = s[f];
      if (m && typeof m === "object") Object.keys(m).forEach(function (k) { if (m[k]) out[lk("s", K, f, k)] = true; });
    });
    if (s.done && typeof s.done === "object") Object.keys(s.done).forEach(function (k) {
      if (s.done[k]) out[lk("s", K, "done", k.indexOf(":") < 0 ? "0:" + k : k)] = true;
    });
    if (s.plan && typeof s.plan === "object") Object.keys(s.plan).forEach(function (d) {
      if (Array.isArray(s.plan[d])) out[lk("s", K, "plan", d)] = s.plan[d];
    });
    if (s.rem && typeof s.rem === "object") Object.keys(s.rem).forEach(function (d) {
      if (!Array.isArray(s.rem[d])) return;
      s.rem[d].forEach(function (it) {
        if (!it || typeof it !== "object") return;
        var id = it.id ? String(it.id) : "x" + hash(d + "|" + String(it.t || ""));
        out[lk("s", K, "rem", d, id, "e")] = true;
        out[lk("s", K, "rem", d, id, "t")] = String(it.t || "");
        if (it.done) out[lk("s", K, "rem", d, id, "done")] = true;
      });
    });
  }

  /* raw = { cls, custom, profile, states:{A,B,C} } : chaînes brutes du stockage local (ou null) */
  function readFlat(raw) {
    var leaves = {}, invalid = {};
    if (raw.cls && CLS.indexOf(raw.cls) >= 0) leaves[lk("cls")] = raw.cls;
    var c = parseObj(raw.custom);
    if (!c.ok) invalid.custom = true; else if (c.v && c.v.g) leaves[lk("custom")] = c.v;
    var p = parseObj(raw.profile);
    if (!p.ok) invalid.profile = true;
    else if (p.v) {
      if (typeof p.v.university === "string" && p.v.university) leaves[lk("profile", "university")] = p.v.university;
      if (typeof p.v.level === "string" && p.v.level) leaves[lk("profile", "level")] = p.v.level;
    }
    CLS.forEach(function (K) {
      var s = parseObj((raw.states || {})[K]);
      if (!s.ok) invalid[K] = true; else if (s.v) flattenState(K, s.v, leaves);
    });
    return { leaves: leaves, invalid: invalid };
  }

  /* ---------- feuilles -> données locales ---------- */
  function buildState(K, leaves, s0) {
    var s = s0 ? clone(s0) : {};
    s.done = {}; s.q = {}; s.off = {}; s.offDay = {}; s.plan = {}; s.rem = {};
    s.note = ""; s.eoe = ""; s.theme = "auto"; s.icsRem = 0; delete s.tm;
    var remItems = {};
    Object.keys(leaves).forEach(function (k) {
      var p = parts(k);
      if (p[0] !== "s" || p[1] !== K) return;
      var f = p[2], v = leaves[k];
      if (f === "note" || f === "eoe" || f === "theme" || f === "icsRem") s[f] = v;
      else if (f === "tm") s.tm = { p: v.p, w: v.w, r: v.r };
      else if (f === "q" || f === "off" || f === "offDay" || f === "done") s[f][p[3]] = true;
      else if (f === "plan") s.plan[p[3]] = v;
      else if (f === "rem" && p.length === 6) {
        var rk = p[3] + "\u0000" + p[4];
        var it = remItems[rk] = remItems[rk] || { day: p[3], id: p[4] };
        if (p[5] === "e") it.e = true; else if (p[5] === "t") it.t = v; else if (p[5] === "done") it.done = true;
      }
    });
    var old = {};
    if (s0 && s0.rem && typeof s0.rem === "object") Object.keys(s0.rem).forEach(function (d) {
      (Array.isArray(s0.rem[d]) ? s0.rem[d] : []).forEach(function (it) {
        if (it && typeof it === "object") old[d + "\u0000" + (it.id ? String(it.id) : "x" + hash(d + "|" + String(it.t || "")))] = it;
      });
    });
    Object.keys(remItems).forEach(function (rk) {
      var it = remItems[rk];
      if (!it.e) return;
      var o = old[rk] ? clone(old[rk]) : {};
      o.id = it.id; o.t = it.t !== undefined ? it.t : (o.t || ""); o.done = !!it.done;
      (s.rem[it.day] = s.rem[it.day] || []).push(o);
    });
    Object.keys(s.rem).forEach(function (d) { s.rem[d].sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }); });
    return s;
  }

  /* Retourne { raw: nouvelles chaînes, changed: {cléDeStockage:true} } ; ne touche pas aux clés illisibles. */
  function applyFlat(leaves, raw, now) {
    var out = { states: {} }, changed = {}, invalid = readFlat(raw).invalid;
    var cls = leaves[lk("cls")] || raw.cls || null;
    out.cls = cls; if (cls !== (raw.cls || null)) changed["ma-semaine-cls"] = true;
    var cu = leaves[lk("custom")];
    if (invalid.custom || !cu) out.custom = raw.custom || null; /* jamais effacé par la fusion */
    else if (eq(parseObj(raw.custom).v, cu)) out.custom = raw.custom;
    else { out.custom = JSON.stringify(cu); changed["ma-semaine-custom"] = true; }
    if (invalid.profile) out.profile = raw.profile;
    else {
      var u = leaves[lk("profile", "university")] || "", l = leaves[lk("profile", "level")] || "";
      var p0 = parseObj(raw.profile).v || {};
      if ((p0.university || "") === u && (p0.level || "") === l) out.profile = raw.profile;
      else { out.profile = (u || l) ? JSON.stringify({ university: u, level: l, updatedAt: now || Date.now() }) : null; changed["ma-semaine-profile"] = true; }
    }
    CLS.forEach(function (K) {
      var cur = (raw.states || {})[K];
      if (invalid[K]) { out.states[K] = cur; return; }
      var s0 = parseObj(cur).v;
      var s = buildState(K, leaves, s0);
      var a = {}, b = {};
      flattenState(K, s, a);
      if (s0) flattenState(K, s0, b);
      if (!s0 && !Object.keys(a).length) { out.states[K] = null; return; }
      if (eq(a, b) && s0) { out.states[K] = cur; return; }
      out.states[K] = JSON.stringify(s); changed[STATE_KEY[K]] = true;
    });
    return { raw: out, changed: changed };
  }

  /* ---------- entrées distantes <-> feuilles ---------- */
  function toRemote(entries) {
    var o = {};
    Object.keys(entries).forEach(function (k) {
      var e = entries[k];
      if (e) o[k] = e.d ? { d: 1, t: e.t } : { j: JSON.stringify(e.v), t: e.t };
    });
    return o;
  }

  function validLeaf(k, v) {
    var p = parts(k), str = function (x, n) { return typeof x === "string" && x.length <= n; };
    if (p[0] === "cls") return p.length === 1 && CLS.indexOf(v) >= 0;
    if (p[0] === "custom") return p.length === 1 && v && typeof v === "object" && stable(v).length <= 30000 && !!v.g;
    if (p[0] === "profile") return p.length === 2 && ((p[1] === "university" && str(v, 80)) || (p[1] === "level" && str(v, 40)));
    if (p[0] !== "s" || CLS.indexOf(p[1]) < 0) return false;
    var f = p[2];
    if (f === "note" || f === "eoe") return p.length === 3 && str(v, 60000);
    if (f === "theme") return p.length === 3 && (v === "light" || v === "dark");
    if (f === "icsRem") return p.length === 3 && typeof v === "number" && v >= 0 && v <= 10080;
    if (f === "tm") return p.length === 3 && v && typeof v === "object" && typeof v.w === "number" && v.w >= 5 && v.w <= 180 && typeof v.r === "number" && v.r >= 1 && v.r <= 60 && str(v.p, 20);
    if (f === "q" || f === "off" || f === "offDay") return p.length === 4 && v === true && p[3].length <= 120;
    if (f === "done") return p.length === 4 && v === true && /^\d{1,3}:[A-Za-z0-9_]{1,20}-\d{1,3}$/.test(p[3]);
    if (f === "plan") return p.length === 4 && p[3].length <= 20 && Array.isArray(v) && v.length <= 60 && stable(v).length <= 12000;
    if (f === "rem") {
      if (p.length !== 6 || p[3].length > 40 || p[4].length > 60) return false;
      if (p[5] === "e" || p[5] === "done") return v === true;
      return p[5] === "t" && str(v, 1000);
    }
    return false;
  }

  /* Valide ce qui vient du cloud : jamais de confiance aveugle. */
  function fromRemote(map) {
    var entries = {}, dropped = 0, n = 0;
    Object.keys(map || {}).forEach(function (k) {
      var e = map[k];
      if (!e || typeof e !== "object" || typeof e.t !== "number" || !isFinite(e.t)) { dropped++; return; }
      if (e.d === 1) { entries[k] = { d: 1, t: e.t }; return; }
      if (typeof e.j !== "string" || e.j.length > 70000) { dropped++; return; }
      var v; try { v = JSON.parse(e.j); } catch (x) { dropped++; return; }
      if (!validLeaf(k, v)) { dropped++; return; }
      if (++n > MAX_LEAVES) { dropped++; return; }
      entries[k] = { v: v, t: e.t };
    });
    return { entries: entries, dropped: dropped };
  }

  /* ---------- fusion à trois voies ---------- */
  function combineText(a, b, aOlder) {
    if (a.indexOf(b) >= 0) return a;
    if (b.indexOf(a) >= 0) return b;
    var first = aOlder ? a : b, second = aOlder ? b : a;
    return first + "\n\n— autre appareil —\n\n" + second;
  }

  function merge(o) {
    var L = o.local || {}, B = o.base || {}, R = o.remote || {}, TS = o.ts || {}, now = o.now || Date.now();
    var all = {};
    [L, B, R].forEach(function (m) { Object.keys(m).forEach(function (k) { all[k] = 1; }); });
    var merged = {}, entries = {}, conflicts = [], side = {};

    Object.keys(all).forEach(function (k) {
      var l = L[k], b = B[k], r = R[k], rv = (r && !r.d) ? r.v : undefined, rt = r ? (r.t || 0) : 0, lt = TS[k] || 0;
      var lch = !eq(l, b), rch = !!r && !eq(rv, b);
      var res, ent, sd;
      if (!lch && !rch) { res = l; sd = "same"; ent = r || (l !== undefined ? { v: l, t: now } : undefined); }
      else if (lch && !rch) { res = l; sd = "local"; ent = l === undefined ? { d: 1, t: lt || now } : { v: l, t: lt || now }; }
      else if (!lch && rch) { res = rv; sd = "remote"; ent = r; }
      else if (eq(l, rv)) { res = l; sd = "same"; ent = r; }
      else {
        if (l === undefined) { res = rv; sd = "remote"; }
        else if (rv === undefined) { res = l; sd = "local"; }
        else {
          var f = parts(k)[2], isText = parts(k)[0] === "s" && (f === "note" || f === "eoe");
          if (isText && typeof l === "string" && typeof rv === "string") {
            res = combineText(l, rv, lt < rt); sd = "merged";
            conflicts.push({ key: k, kept: "merged", local: l, remote: rv, at: now });
          } else if (lt > rt) { res = l; sd = "local"; conflicts.push({ key: k, kept: "local", local: l, remote: rv, at: now }); }
          else { res = rv; sd = "remote"; conflicts.push({ key: k, kept: "remote", local: l, remote: rv, at: now }); }
        }
        var t = Math.max(lt, rt) || now;
        ent = res === undefined ? { d: 1, t: t } : { v: res, t: t };
      }
      if (res !== undefined) merged[k] = res;
      if (ent) entries[k] = ent;
      side[k] = sd;
    });

    /* Les séances cochées sont numérotées par position : elles suivent le planning du jour qui a gagné. */
    Object.keys(all).forEach(function (k) {
      var p = parts(k);
      if (p[0] !== "s" || p[2] !== "done") return;
      var m = /^\d+:(.+)-\d+$/.exec(p[3]);
      if (!m) return;
      var pk = lk("s", p[1], "plan", m[1]);
      var sd = side[pk];
      if (sd !== "local" && sd !== "remote") return;
      var l = L[k], r = R[k], rv = (r && !r.d) ? r.v : undefined;
      var res = sd === "local" ? l : rv;
      var lost = sd === "local" ? rv : l;
      if (lost !== undefined && !eq(lost, res)) conflicts.push({ key: k, kept: sd, local: l, remote: rv, at: now, note: "séance cochée liée à un planning modifié" });
      if (res === undefined) {
        delete merged[k];
        if (r && !r.d) entries[k] = { d: 1, t: now };
        else if (!(entries[k] && entries[k].d)) delete entries[k];
      } else { merged[k] = res; entries[k] = { v: res, t: (entries[k] && entries[k].t) || now }; }
      side[k] = sd;
    });

    var remoteWin = {}, remoteDirty = false;
    Object.keys(all).forEach(function (k) {
      if (!eq(merged[k], L[k])) remoteWin[k] = true;
      if (entries[k] && entries[k].d && now - (entries[k].t || 0) > TOMB_MS) delete entries[k];
    });
    Object.keys(all).forEach(function (k) { if (!eq(entries[k], R[k])) remoteDirty = true; });
    return { merged: merged, entries: entries, conflicts: conflicts, remoteWin: remoteWin, remoteDirty: remoteDirty, tooBig: Object.keys(entries).length > MAX_LEAVES };
  }

  /* Remet à jour la base : tout ce qui est confirmé, sauf les feuilles où le cloud a gagné et qui ne sont pas encore appliquées. */
  function advanceBase(base, mergeRes) {
    var nb = {};
    var keys = {}; Object.keys(base).forEach(function (k) { keys[k] = 1; }); Object.keys(mergeRes.merged).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var v = mergeRes.remoteWin[k] ? base[k] : mergeRes.merged[k];
      if (v !== undefined) nb[k] = v;
    });
    return nb;
  }

  return { CLS: CLS, STATE_KEY: STATE_KEY, RAW_KEYS: RAW_KEYS, MAX_LEAVES: MAX_LEAVES, lk: lk, parts: parts, eq: eq, stable: stable, clone: clone,
    readFlat: readFlat, applyFlat: applyFlat, merge: merge, advanceBase: advanceBase, toRemote: toRemote, fromRemote: fromRemote, validLeaf: validLeaf };
});
