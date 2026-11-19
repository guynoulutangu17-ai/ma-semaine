/* Tests unitaires du moteur de fusion : node tests/sync-core.test.js */
"use strict";
var assert = require("assert"), C = require("../sync-core.js");
var n = 0, lk = C.lk;
function t(name, fn) { try { fn(); n++; console.log("PASS", name); } catch (e) { console.log("FAIL", name, "\n", e.message); process.exitCode = 1; } }
function raw(o) { return { cls: o.cls || null, custom: o.custom || null, profile: o.profile || null, states: { A: null, B: o.B ? JSON.stringify(o.B) : null, C: null } }; }
function st(o) { return Object.assign({ done: {}, q: {}, note: "", eoe: "", theme: "auto", rem: {}, off: {}, offDay: {}, plan: {}, icsRem: 0, tm: { p: "classic", w: 25, r: 5 } }, o); }
function flatOf(o) { return C.readFlat(raw(o)).leaves; }
function asRemote(leaves, t) { var r = {}; Object.keys(leaves).forEach(function (k) { r[k] = { v: leaves[k], t: t || 1000 }; }); return r; }
var NOW = 2000000;

t("aller-retour : aplatir puis reconstruire ne change rien (idempotent)", function () {
  var r = raw({ cls: "B", B: st({ note: "salut", rem: { "2026-11-18": [{ id: "a1", t: "TP", done: false }, { id: "a2", t: "Lire", done: true }] }, off: { "2026-11-18|1": true }, done: { "0:lun-0": true }, plan: { lun: [["19h00-20h00", "x"]] } }), profile: JSON.stringify({ university: "UNIKIN", level: "L1", updatedAt: 1 }) });
  var f = C.readFlat(r).leaves, a = C.applyFlat(f, r, NOW);
  assert.deepStrictEqual(a.changed, {});
  assert.deepStrictEqual(C.readFlat(a.raw).leaves, f);
});

t("nouveau téléphone : restauration complète depuis le cloud", function () {
  var cloud = flatOf({ cls: "B", B: st({ note: "ma note", rem: { d1: [{ id: "r1", t: "Rappel", done: true }] }, done: { "1:mar-0": true }, offDay: { d2: true }, plan: { mer: [["15h00-16h00", "Maths"]] }, tm: { p: "deep", w: 50, r: 10 } }), profile: JSON.stringify({ university: "UNIKIN", level: "L1 LMD" }) });
  var m = C.merge({ local: {}, base: {}, remote: asRemote(cloud), ts: {}, now: NOW });
  assert.strictEqual(Object.keys(m.remoteWin).length, Object.keys(cloud).length);
  var a = C.applyFlat(m.merged, raw({}), NOW), s = JSON.parse(a.raw.states.B);
  assert.strictEqual(s.note, "ma note"); assert.deepStrictEqual(s.rem.d1, [{ id: "r1", t: "Rappel", done: true }]);
  assert.ok(s.done["1:mar-0"]); assert.ok(s.offDay.d2); assert.deepStrictEqual(s.plan.mer, [["15h00-16h00", "Maths"]]); assert.strictEqual(s.tm.w, 50);
  assert.strictEqual(JSON.parse(a.raw.profile).university, "UNIKIN"); assert.strictEqual(a.raw.cls, "B");
});

t("première connexion : données locales + cloud fusionnées sans doublon, ids conservés, rien de perdu", function () {
  var loc = flatOf({ cls: "B", B: st({ rem: { d1: [{ id: "L1", t: "local", done: false }, { id: "S", t: "commun", done: false }] }, done: { "0:lun-0": true }, off: { "d|1": true } }) });
  var cl = flatOf({ cls: "B", B: st({ rem: { d1: [{ id: "C1", t: "cloud", done: false }, { id: "S", t: "commun", done: true }] }, done: { "0:lun-1": true }, q: { q1: true } }) });
  var m = C.merge({ local: loc, base: {}, remote: asRemote(cl, 1500), ts: {}, now: NOW });
  var s = JSON.parse(C.applyFlat(m.merged, raw({ cls: "B", B: st({ rem: { d1: [{ id: "L1", t: "local", done: false }, { id: "S", t: "commun", done: false }] }, done: { "0:lun-0": true }, off: { "d|1": true } }) }), NOW).raw.states.B);
  assert.deepStrictEqual(s.rem.d1.map(function (x) { return x.id; }), ["C1", "L1", "S"]);
  assert.strictEqual(s.rem.d1.filter(function (x) { return x.t === "commun"; }).length, 1);
  assert.ok(s.done["0:lun-0"] && s.done["0:lun-1"] && s.off["d|1"] && s.q.q1);
  // répétable : on refusionne le résultat avec base = fusion, aucun changement ni doublon
  var m2 = C.merge({ local: m.merged, base: C.advanceBase({}, m), remote: C.fromRemote(C.toRemote(m.entries)).entries, ts: {}, now: NOW + 1 });
  assert.strictEqual(Object.keys(m2.remoteWin).length, 0); assert.strictEqual(m2.remoteDirty, false); assert.strictEqual(m2.conflicts.length, 0);
  assert.deepStrictEqual(m2.merged, m.merged);
});

t("notes modifiées sur deux appareils : les deux textes sont conservés", function () {
  var k = lk("s", "B", "note"), base = {}; base[k] = "base";
  var m = C.merge({ local: (function () { var o = {}; o[k] = "base + ajout local"; return o; })(), base: base, remote: (function () { var o = {}; o[k] = { v: "base + ajout cloud", t: 1500 }; return o; })(), ts: (function () { var o = {}; o[k] = 1800; return o; })(), now: NOW });
  assert.ok(m.merged[k].indexOf("ajout local") >= 0 && m.merged[k].indexOf("ajout cloud") >= 0);
  assert.ok(m.merged[k].indexOf("base + ajout cloud") < m.merged[k].indexOf("base + ajout local"), "le plus ancien d'abord");
  assert.strictEqual(m.conflicts[0].kept, "merged");
});

t("cours annulés : annulation sur un appareil, rétablissement sur l'autre, ajout simultané", function () {
  var X = lk("s", "B", "off", "d|1"), Y = lk("s", "B", "off", "d|2");
  var base = {}; base[X] = true;
  var local = {}; local[Y] = true; local[X] = true;
  var remote = {}; remote[X] = { d: 1, t: 1600 };
  var m = C.merge({ local: local, base: base, remote: remote, ts: (function () { var o = {}; o[Y] = 1700; return o; })(), now: NOW });
  assert.ok(!m.merged[X], "rétablissement distant appliqué"); assert.ok(m.merged[Y], "annulation locale conservée");
  assert.ok(m.entries[X].d && m.entries[Y].v === true);
});

t("suppression d'un rappel : marqueur de suppression poussé, puis appliqué sur l'autre appareil", function () {
  var e = lk("s", "B", "rem", "d1", "r1", "e"), tx = lk("s", "B", "rem", "d1", "r1", "t");
  var base = {}; base[e] = true; base[tx] = "x";
  var m = C.merge({ local: {}, base: base, remote: (function () { var o = {}; o[e] = { v: true, t: 1 }; o[tx] = { v: "x", t: 1 }; return o; })(), ts: (function () { var o = {}; o[e] = 5; o[tx] = 5; return o; })(), now: NOW });
  assert.ok(m.entries[e].d && m.entries[tx].d);
  var m2 = C.merge({ local: base, base: base, remote: m.entries, ts: {}, now: NOW });
  assert.ok(!m2.merged[e] && !m2.merged[tx]);
  var back = JSON.parse(C.applyFlat(m2.merged, raw({ B: st({ rem: { d1: [{ id: "r1", t: "x", done: false }] } }) }), NOW).raw.states.B);
  assert.deepStrictEqual(back.rem, {});
});

t("planning modifié : les séances cochées suivent le planning gagnant, la version perdue est signalée", function () {
  var P = lk("s", "B", "plan", "lun"), D0 = lk("s", "B", "done", "0:lun-0"), D1 = lk("s", "B", "done", "0:lun-1");
  var local = {}; local[D1] = true;                       // cet appareil : planning inchangé, séance 1 cochée
  var remote = {}; remote[P] = { v: [["19h", "a"]], t: 1700 }; remote[D0] = { v: true, t: 1700 }; // l'autre : planning modifié + séance 0
  var m = C.merge({ local: local, base: {}, remote: remote, ts: {}, now: NOW });
  assert.ok(m.merged[D0] && !m.merged[D1]);
  assert.ok(m.conflicts.some(function (c) { return c.key === D1; }), "séance perdue signalée, pas silencieuse");
});

t("conflit sur une valeur simple : le plus récent gagne, l'autre est mise de côté", function () {
  var k = lk("custom"), base = {}; base[k] = { g: { lun: ["ang"] }, v: 0 };
  var loc = {}; loc[k] = { g: { lun: ["log"] }, v: 1 };
  var rem = {}; rem[k] = { v: { g: { lun: ["sta"] }, v: 2 }, t: 1900 };
  var m = C.merge({ local: loc, base: base, remote: rem, ts: (function () { var o = {}; o[k] = 1800; return o; })(), now: NOW });
  assert.strictEqual(m.merged[k].v, 2); assert.strictEqual(m.conflicts[0].kept, "remote"); assert.strictEqual(m.conflicts[0].local.v, 1);
});

t("modification contre suppression : la donnée est conservée", function () {
  var k = lk("profile", "level"), base = {}; base[k] = "L1";
  var loc = {}; loc[k] = "L2";
  var m = C.merge({ local: loc, base: base, remote: (function () { var o = {}; o[k] = { d: 1, t: 1900 }; return o; })(), ts: (function () { var o = {}; o[k] = 1800; return o; })(), now: NOW });
  assert.strictEqual(m.merged[k], "L2");
});

t("validation des données reçues : entrées invalides rejetées", function () {
  var ok = C.toRemote((function () { var o = {}; o[lk("s", "B", "note")] = { v: "ok", t: 1 }; o[lk("s", "B", "plan", "lun")] = { v: [["a", "b"]], t: 1 }; return o; })());
  var bad = {
    "s~Z~note": { j: "\"x\"", t: 1 }, "s~B~eoe": { j: JSON.stringify("a".repeat(70000)), t: 1 }, "evil": { j: "1", t: 1 },
    "s~B~theme": { j: "\"<script>\"", t: 1 }, "s~B~done~oops": { j: "true", t: 1 }, "s~B~icsRem": { j: "99999999", t: 1 },
    "cls": { j: "\"Z\"", t: 1 }, "s~B~tm": { j: "{\"w\":1,\"r\":1,\"p\":\"x\"}", t: 1 }, "s~B~q~k": { j: "true", t: "x" }
  };
  var r = C.fromRemote(Object.assign({}, ok, bad));
  assert.strictEqual(Object.keys(r.entries).length, 2); assert.strictEqual(r.dropped, Object.keys(bad).length);
  assert.deepStrictEqual(r.entries[lk("s", "B", "plan", "lun")].v, [["a", "b"]]);
});

t("Firestore : aucun tableau imbriqué envoyé (valeurs sérialisées en texte)", function () {
  var o = C.toRemote((function () { var e = {}; e[lk("s", "B", "plan", "lun")] = { v: [["a", "b"]], t: 5 }; return e; })());
  Object.keys(o).forEach(function (k) { assert.strictEqual(typeof o[k].j, "string"); });
});

t("anciens marqueurs de suppression purgés après 180 jours", function () {
  var k = lk("s", "B", "q", "x"), old = {}; old[k] = { d: 1, t: 1 };
  var m = C.merge({ local: {}, base: {}, remote: old, ts: {}, now: 1 + 181 * 24 * 3600 * 1000 });
  assert.ok(!m.entries[k]);
});

t("clé locale illisible : jamais écrasée par la fusion", function () {
  var r = raw({}); r.states.B = "{pas du json";
  var a = C.applyFlat((function () { var o = {}; o[lk("s", "B", "note")] = "x"; return o; })(), r, NOW);
  assert.strictEqual(a.raw.states.B, "{pas du json"); assert.ok(!a.changed["l1b-planner-v2"]);
});

console.log(n + " tests réussis");
