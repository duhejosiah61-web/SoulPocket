// 摆烂版 sw.js：只满足安装条件，不缓存任何文件

// 1. 安装时，立刻接管，不等待
self.addEventListener('install', event => {
  self.skipWaiting(); 
});

// 2. 激活时，把以前存的旧缓存全部删掉！(解决你的缓存地狱)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// 3. 抓取请求时：什么都不拦，永远直接去网络上拿最新代码
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});