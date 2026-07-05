/* Nova Calendar — background push handler (required by Firebase Cloud Messaging).
 *
 * This runs as its own service worker so notifications arrive even when the app
 * is fully closed. It uses the Firebase "compat" builds because messaging SW
 * needs importScripts (classic worker, not an ES module).
 *
 * Paste the SAME public firebaseConfig you put in cloud.js below.
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

// Show the notification when a push arrives while the app is in the background.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Nova Calendar";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, {
    body,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: (payload.data && payload.data.tag) || "nova",
  });
});

// Focus/open the app when a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});
