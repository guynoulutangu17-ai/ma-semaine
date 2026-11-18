// Génère firebase-config.js à partir d'un fichier .env (voir .env.example) ou de l'environnement.
// Ces valeurs sont PUBLIQUES par conception (config Web Firebase) : jamais de clé privée ici.
// Usage : node scripts/gen-firebase-config.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const f = join(root, ".env");
if (existsSync(f)) {
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const keys = { apiKey: "FIREBASE_API_KEY", authDomain: "FIREBASE_AUTH_DOMAIN", projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET", messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID", appId: "FIREBASE_APP_ID" };
const cfg = {};
for (const [k, v] of Object.entries(keys)) cfg[k] = env[v] || "";
const missing = ["apiKey", "authDomain", "projectId", "appId"].filter((k) => !cfg[k]);
if (missing.length) { console.error("Paramètres manquants : " + missing.join(", ")); process.exit(1); }
writeFileSync(join(root, "firebase-config.js"),
  "/* Config Web Firebase (publique). Générée par scripts/gen-firebase-config.mjs */\nwindow.MS_FIREBASE_CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n");
console.log("firebase-config.js écrit pour le projet " + cfg.projectId);
