// filepath: src/custom-service-worker.js
import { registerRoute } from 'https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-routing.js';
import { StaleWhileRevalidate } from 'https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-strategies.js';
import { precacheAndRoute } from 'https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-precaching.js';

// Precache alle Assets und index.html
precacheAndRoute([{"revision":"e67a3782cd55cb52ca500f39ca534f7e","url":"index.html"},{"revision":"e99d788948431329ba24f552b5d0bc64","url":"static/css/main.1299d285.css"},{"revision":"2f19d52fcb243df7a4ea55d5696ccc28","url":"static/js/main.ac554b6f.js"}] || []);
precacheAndRoute([{ url: '/', revision: null }]);  // Manuell index.html hinzufügen

// Cache-Strategie für Dokumente
registerRoute(
  ({ request }) => request.destination === 'document',
  new StaleWhileRevalidate()
);

// Optional: Cache für API
registerRoute(
  ({ url }) => url.pathname.startsWith('/api'),
  new StaleWhileRevalidate()
);