import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createHash } from 'node:crypto'

function serviceWorkerPlugin() {
  return {
    name: 'vcms-service-worker',
    generateBundle(_options, bundle) {
      // 版本号基于构建产物指纹（文件名已含内容 hash）：内容不变则版本不变，避免每次部署强刷缓存/弹升级
      const fingerprint = Object.keys(bundle)
        .filter((f) => f !== 'sw.js')
        .sort()
        .join('|')
      const version = createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const VERSION = '${version}';
const CACHE_NAME = 'vcms-web-' + VERSION;
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('vcms-web-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.destination === 'video' || request.destination === 'audio') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    }))
  );
});
`.trim(),
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), serviceWorkerPlugin()],
  server: { port: 5152, host: true, proxy: { '/api': 'http://127.0.0.1:5150' } }
})
