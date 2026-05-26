const CACHE_NAME = 'minimal-phone-white-v1';

// 需要缓存的所有本地文件
const assetsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './script.js',
  './mate.js',
  './feed.js',
  './hub.js',
  './logo.png'
];

// 安装阶段：预缓存所有资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('正在预缓存资源...');
      return cache.addAll(assetsToCache);
    })
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 请求拦截：先找缓存，找不到再联网
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
