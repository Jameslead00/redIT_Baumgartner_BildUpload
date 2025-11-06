// filepath: src/custom-service-worker.js
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { precacheAndRoute } from 'workbox-precaching';

// Precache alle Assets (inkl. index.html)
precacheAndRoute([{"revision":"e67a3782cd55cb52ca500f39ca534f7e","url":"index.html"},{"revision":"e99d788948431329ba24f552b5d0bc64","url":"static/css/main.1299d285.css"},{"revision":"2f19d52fcb243df7a4ea55d5696ccc28","url":"static/js/main.ac554b6f.js"}] || []);

// Cache-Strategie für API-Aufrufe (optional)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api'),
  new StaleWhileRevalidate()
);

// Cache index.html für Offline
registerRoute(
  ({ request }) => request.destination === 'document',
  new StaleWhileRevalidate()
);