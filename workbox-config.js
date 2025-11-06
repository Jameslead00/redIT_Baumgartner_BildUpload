module.exports = {
  swDest: 'build/custom-service-worker.js',
  importScripts: ['https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js'],
  globDirectory: 'build',
  globPatterns: ['**/*.{js,css,html,png,jpg,svg}'],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.destination === 'document',
      handler: 'StaleWhileRevalidate',
    },
  ],
};