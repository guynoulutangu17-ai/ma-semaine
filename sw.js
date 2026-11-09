/* Mode hors connexion : les fichiers de l'application sont gardés sur le téléphone.
   Pour publier une nouvelle version, changez le numéro ci-dessous. */
var CACHE = "ma-semaine-v3";
var CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png",
            "icon-maskable-512.png", "apple-touch-icon.png", "Cours-L1-LMD-B.ics", "Cours-L1-LMD-A.ics"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var ok = url.origin === location.origin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!ok) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return hit || (req.mode === "navigate" ? cache.match("index.html") : undefined);
      });
      return hit || net;
    });
  }));
});
