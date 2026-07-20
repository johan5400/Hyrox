/* ★ HYROX — service worker terrain
   Objectif : les apps se chargent MÊME SANS RÉSEAU (wifi de compét qui tousse).
   - HTML : réseau d'abord (pour récupérer les mises à jour), cache en secours.
   - Scripts/CDN (Firebase, fonts) : cache d'abord, mise à jour en arrière-plan.
   Pour déployer une nouvelle version des fichiers : incrémente V ci-dessous. */
var V = 'hyrox-v1';
var SHELL = [
  './index.html',
  './juge-hyrox.html',
  './live-hyrox.html',
  './tk-hyrox.html',
  './depart.html',
  './arrivee.html'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(V).then(function(c){
      // addAll échoue en bloc si un fichier manque → on cache un par un, best-effort
      return Promise.all(SHELL.map(function(u){
        return c.add(u).catch(function(){ /* fichier absent : tant pis, pas bloquant */ });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==V; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return; // Firebase écrit via WebSocket/POST : ne pas toucher

  var isHTML = req.mode === 'navigate' || (req.headers.get('accept')||'').indexOf('text/html') >= 0;

  if (isHTML) {
    // Réseau d'abord (mises à jour), cache en secours (offline)
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(V).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req, {ignoreSearch:true}).then(function(hit){
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Assets (SDK Firebase, fonts, QR api…) : cache d'abord + refresh en arrière-plan
  e.respondWith(
    caches.match(req).then(function(hit){
      var refresh = fetch(req).then(function(res){
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(V).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || refresh;
    })
  );
});
