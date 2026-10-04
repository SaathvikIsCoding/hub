// Service worker: keeps the app shell available offline and lets the app install.
// App files: network first (always fresh when online), cache as the fallback.
// API calls (Google, GitHub) are never cached here; the app keeps its own copy.
const CACHE = 'hub-v1';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/auth.js', 'js/google.js', 'js/github.js',
  'js/views/today.js', 'js/views/mail.js', 'js/views/calendar.js', 'js/views/tasks.js',
  'js/views/notes.js', 'js/views/updates.js', 'js/views/portfolio.js', 'js/views/settings.js', 'js/views/focus.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

// Clicking a reminder brings the app to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./#/calendar'))));
});
