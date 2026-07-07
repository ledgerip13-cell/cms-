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

// ===== iCloud 客户端解析（方案A）——合并自 cloud-worker.js =====
// 拦截所有含 /iclouddrive/ 的请求（主 m3u8 + 每个 .ts 分片），走 Apple CloudKit 公开分享 API 解析真实直链。
// 视频直连 iCloud，本站服务器零介入。参数与源站一致（实测 2026-07-07）。
const ICLOUD_CK = { ckjsBuildVersion: '1954c05c4f41058728b542451db280c466a18f51', ckjsVersion: '2.6.4', clientBuildNumber: '2511Hotfix24', clientMasteringNumber: '2511Hotfix24' };
function icloudUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){var r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);}); }
function icloudShortGUID(u) { if(!u.includes('/iclouddrive/')) return u; var m=u.match(/\\/iclouddrive\\/([a-zA-Z0-9_-]+)(?:[#\\/].*|$)/); if(!m||m.length<2) throw new Error('bad iCloud link'); return m[1]; }
async function icloudDownloadURL(shortGUID) {
  var cid = icloudUUID().toLowerCase();
  var api = 'https://ckdatabasews.icloud.com/database/1/com.apple.cloudkit/production/public/records/resolve?ckjsBuildVersion=' + ICLOUD_CK.ckjsBuildVersion + '&ckjsVersion=' + ICLOUD_CK.ckjsVersion + '&clientId=' + cid + '&clientBuildNumber=' + ICLOUD_CK.clientBuildNumber + '&clientMasteringNumber=' + ICLOUD_CK.clientMasteringNumber;
  var resp = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ shortGUIDs: [{ value: shortGUID }] }) });
  if(!resp.ok) throw new Error('CK HTTP ' + resp.status);
  var data = await resp.json();
  var rec = data && data.results && data.results[0] && data.results[0].rootRecord;
  var fc = rec && rec.fields && rec.fields.fileContent;
  if(!fc || fc.type !== 'ASSETID' || !fc.value || !fc.value.downloadURL) throw new Error('resolve failed');
  return fc.value.downloadURL;
}
var icloudCache = { map: new Map(), maxAge: 5*60*1000, maxSize: 200,
  set: function(directUrl, icloudUrl){ try{ var k=new URL(directUrl).href, now=Date.now(); this.map.set(k,{icloudUrl:icloudUrl,lastAccess:now}); this.cleanup(now);}catch(e){} },
  get: function(directUrl){ try{ var k=new URL(directUrl).href, e=this.map.get(k); if(e){var now=Date.now(); if(now-e.lastAccess<this.maxAge){e.lastAccess=now;return e.icloudUrl;} this.map.delete(k);} }catch(e){} return null; },
  cleanup: function(now){ now=now||Date.now(); for(var kv of this.map){ if(now-kv[1].lastAccess>this.maxAge) this.map.delete(kv[0]); } if(this.map.size>this.maxSize){ var s=[...this.map.entries()].sort(function(a,b){return a[1].lastAccess-b[1].lastAccess;}); s.slice(0,this.map.size-this.maxSize).forEach(function(x){this.map.delete(x[0]);},this);} } };
async function handleICloud(url, req) {
  try {
    var shortGUID = icloudShortGUID(url);
    var directUrl = await icloudDownloadURL(shortGUID);
    var urlObj = new URL(url), filename = '';
    if(urlObj.hash) filename = urlObj.hash.substring(1);
    else { var parts = urlObj.pathname.split('/'), last = parts[parts.length-1]; if(last && last !== shortGUID) filename = last; }
    if(directUrl.includes('\${f}') && filename) directUrl = directUrl.replace('\${f}', encodeURIComponent(filename));
    icloudCache.set(directUrl, url);
    var resp = await fetch(directUrl, { method: req.method, headers: new Headers(req.headers), mode: 'cors', credentials: 'omit' });
    if(url.includes('.m3u8')) { var h = new Headers(resp.headers); h.set('Cache-Control','no-cache, no-store, must-revalidate'); return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h }); }
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}

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
  // iCloud 拦截优先（跨源，须在同源判断之前）：直链反查 + iclouddrive 命中即客户端解析
  let icloudTarget = request.url;
  const mapped = icloudCache.get(icloudTarget);
  if (mapped) icloudTarget = mapped;
  if (icloudTarget.includes('/iclouddrive/')) { event.respondWith(handleICloud(icloudTarget, request)); return; }
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
