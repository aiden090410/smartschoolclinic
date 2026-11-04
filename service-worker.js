/**
 * 스마트 보건실 PWA 서비스 워커 (service-worker.js)
 */

const CACHE_NAME = "labit-cache-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./script.js",
  "./manifest.json",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

// 서비스 워커 설치 및 리소스 사전 캐싱
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] 새 앱 아이콘 및 자산 캐싱 완료");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 이전 버전의 구 캐시 자동 정리
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] 이전 구 버전 캐시 삭제:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 네트워크 우선 / 캐시 폴백 통신 처리
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
