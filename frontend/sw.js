// A simple service worker to satisfy PWA install requirements
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Allows the app to work as a PWA
});
