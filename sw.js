/* Nova Calendar — SINGLE service worker: FCM push + offline cache.
 *
 * Using one SW for both jobs avoids two service workers fighting over the same
 * scope (which silently drops push messages). This file handles background push
 * notifications AND the network-first offline cache.
 */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyB-l8B3UpPB2pr_nSvPWoMDT0VyJ45HviU",
  authDomain: "nova-calendar-b5ecb.firebaseapp.com",
  projectId: "nova-calendar-b5ecb",
  storageBucket: "nova-calendar-b5ecb.firebasestorage.app",
  messagingSenderId: "197755533221",
  appId: "1:197755533221:web:9ab775b5c249470c7d1a4c",
});

const messaging = firebase.messaging();

// Push received while the app is in the background / closed → show it.
messaging.onBackgroundMessage((payload) => {
  const n = (payload && payload.notification) || {};
  self.registration.showNotification(n.title || "Nova Calendar", {
    body: n.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: (payload.data && payload.data.tag) || "nova",
  });
});

// Tapping a notification focuses/opens the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});

/* ---- Offline cache (network-first, auto-updating) ---- */
const CACHE = "nova-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./background.js",
  "./cloud.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Only our own origin. Firebase / FCM / gstatic calls pass straight through.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
