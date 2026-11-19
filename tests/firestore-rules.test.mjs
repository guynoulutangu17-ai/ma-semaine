// Tests des règles de sécurité avec Firebase Emulator Suite (nécessite Java et le téléchargement de l'émulateur).
// Lancer : npx firebase-tools emulators:exec --only firestore "node tests/firestore-rules.test.mjs"
// (avec : npm i --no-save @firebase/rules-unit-testing firebase firebase-tools)
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-ma-semaine", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
let n = 0; const ok = (m) => console.log("PASS", m, ++n);
const alice = env.authenticatedContext("alice").firestore(), bob = env.authenticatedContext("bob").firestore(), anon = env.unauthenticatedContext().firestore();
const A = (db) => doc(db, "users/alice/sync/state");
const good = (rev) => ({ v: 1, leaves: { a: { j: "1", t: 1 } }, rev, updatedAt: serverTimestamp() });
await assertSucceeds(setDoc(A(alice), good(1))); ok("propriétaire crée son document");
await assertSucceeds(getDoc(A(alice))); ok("propriétaire lit");
await assertFails(getDoc(A(bob))); ok("autre utilisateur ne lit pas");
await assertFails(setDoc(A(bob), good(1))); ok("autre utilisateur n'écrit pas");
await assertFails(getDoc(A(anon))); ok("anonyme ne lit pas");
await assertFails(setDoc(A(anon), good(1))); ok("anonyme n'écrit pas");
await assertSucceeds(setDoc(A(alice), good(2))); ok("mise à jour rev+1");
await assertFails(setDoc(A(alice), good(2))); ok("rev inchangée refusée");
await assertFails(setDoc(A(alice), good(9))); ok("saut de rev refusé");
await assertFails(setDoc(A(alice), { ...good(3), extra: 1 })); ok("champ inconnu refusé");
await assertFails(setDoc(A(alice), { ...good(3), leaves: "x" })); ok("leaves non-map refusé");
await assertFails(setDoc(A(alice), { ...good(3), updatedAt: new Date() })); ok("horodatage client refusé");
await assertFails(deleteDoc(A(alice))); ok("suppression refusée");
await assertFails(setDoc(doc(alice, "users/alice/autre/x"), { a: 1 })); ok("autre chemin refusé");
await assertFails(setDoc(doc(alice, "users/bob/sync/state"), good(1))); ok("espace d'un autre refusé");
const big = {}; for (let i = 0; i < 3001; i++) big["k" + i] = { j: "1", t: 1 };
await assertFails(setDoc(A(alice), { ...good(3), leaves: big })); ok("plus de 3000 feuilles refusé");
await env.cleanup(); console.log(n + " tests de règles réussis");
