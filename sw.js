/* Mode hors connexion : les fichiers de l'application sont gardés sur le téléphone.
   Réseau d'abord (nouvelle version tout de suite), copie locale si le réseau est absent ou trop lent.
   Pour publier une nouvelle version, changez le numéro ci-dessous. */
var CACHE = "ma-semaine-v11";
var CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png",
            "icon-maskable-512.png", "apple-touch-icon.png"];

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
  if (url.pathname.indexOf("/vendor/") > -1) {
    /* gros fichiers qui ne changent jamais : copie locale d'abord, réseau sans délai limite */
    e.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var fromCache = function () {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
      });
    };
    var net = new Promise(function (resolve, reject) {
      var done = false, timer = setTimeout(function () { if (!done) reject(new Error("lent")); }, 3000);
      fetch(req, { cache: "no-cache" }).then(function (res) {
        done = true; clearTimeout(timer);
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        resolve(res);
      }, function (err) { done = true; clearTimeout(timer); reject(err); });
    });
    return net.catch(fromCache);
  }));
});
