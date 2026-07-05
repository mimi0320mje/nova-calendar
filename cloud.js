/* ===== Nova Calendar — cloud login + real-time sync (Firebase) =====
 *
 * This file is the ONLY place that talks to Firebase. app.js never imports
 * Firebase directly — it just calls window.NovaCloud (same isolation idea as the
 * water tracker's cloud.js).
 *
 * The values in CONFIG are PUBLIC client values — safe to commit to a public
 * repo. Security is enforced by Firestore rules (each user only reads/writes
 * their own data), not by hiding these.
 *
 * Until you paste your real Firebase config below, isConfigured() returns false
 * and the whole app runs in guest mode (events in localStorage).
 */

const CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyB-l8B3UpPB2pr_nSvPWoMDT0VyJ45HviU",
    authDomain: "nova-calendar-b5ecb.firebaseapp.com",
    projectId: "nova-calendar-b5ecb",
    storageBucket: "nova-calendar-b5ecb.firebasestorage.app",
    messagingSenderId: "197755533221",
    appId: "1:197755533221:web:9ab775b5c249470c7d1a4c",
  },
  // Cloud Messaging "Web Push certificate" key pair → public key.
  vapidKey: "BLsTn2uROjHDHK4LXDmRoD452puBWWMJYrY0V9gLyKzXP19dvOU_233MhBCg_SRre4gOLIlUmprIXtL2npiyomQ",
};

const configured = !CONFIG.firebaseConfig.apiKey.startsWith("PASTE_");

let currentUser = null;
function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent("nova-auth-changed", { detail: { user: currentUser } }));
}

if (!configured) {
  // Not set up yet — expose a stub so app.js cleanly stays in guest mode.
  window.NovaCloud = {
    isConfigured: () => false,
    getUser: () => null,
  };
} else {
  // Load Firebase only when actually configured (keeps guest mode lightweight).
  const V = "10.12.2";
  const [{ initializeApp }, authMod, dbMod, msgMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-messaging.js`),
  ]);

  const {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut,
  } = authMod;
  const {
    getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc,
    updateDoc, serverTimestamp, Timestamp, arrayUnion, query, orderBy,
  } = dbMod;
  const { getMessaging, getToken, onMessage } = msgMod;

  const app = initializeApp(CONFIG.firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let messaging = null;
  try { messaging = getMessaging(app); } catch { /* unsupported browser */ }

  // Foreground messages: when the app tab is OPEN and focused, Firebase does NOT
  // auto-display the push — it delivers it here instead. Show it ourselves so a
  // reminder appears whether the app is open or closed. (The closed/background
  // case is handled by firebase-messaging-sw.js.)
  if (messaging) {
    onMessage(messaging, async (payload) => {
      const n = (payload && payload.notification) || {};
      const title = n.title || "Nova Calendar";
      const opts = { body: n.body || "", icon: "./icons/icon-192.png", tag: (payload.data && payload.data.tag) || "nova" };
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, opts);
      } catch (_) {
        try { new Notification(title, opts); } catch (__) { /* give up quietly */ }
      }
    });
  }

  const eventsCol = (uid) => collection(db, "users", uid, "events");
  const userDoc = (uid) => doc(db, "users", uid);

  // Turn a {date, time} pair into the event's start + reminder timestamps.
  // No time = all-day event: it shows in the 9am summary but gets no 5-min ping.
  function computeTimes(evt) {
    if (!evt.time) return { start: null, remindAt: null };
    const [y, m, d] = evt.date.split("-").map(Number);
    const [hh, mm] = evt.time.split(":").map(Number);
    const start = new Date(y, m - 1, d, hh, mm, 0, 0);
    const remindAt = new Date(start.getTime() - 5 * 60 * 1000);
    return { start: Timestamp.fromDate(start), remindAt: Timestamp.fromDate(remindAt) };
  }

  function docToEvent(d) {
    const x = d.data();
    return { id: d.id, title: x.title || "", date: x.date, time: x.time || "", note: x.note || "" };
  }

  const NovaCloud = {
    isConfigured: () => true,
    getUser: () => currentUser,

    async signUp(email, password) {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    async logIn(email, password) {
      await signInWithEmailAndPassword(auth, email, password);
    },
    async logOut() {
      await signOut(auth);
    },

    // Live feed of this user's events → calls cb(list) on every change.
    subscribeEvents(cb) {
      if (!currentUser) { cb([]); return () => {}; }
      const q = query(eventsCol(currentUser.uid), orderBy("date"));
      return onSnapshot(q, (snap) => cb(snap.docs.map(docToEvent)),
        (err) => console.error("events listen failed", err));
    },

    async addEvent(evt) {
      const uid = currentUser.uid;
      const id = "e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const { start, remindAt } = computeTimes(evt);
      await setDoc(doc(eventsCol(uid), id), {
        title: evt.title, date: evt.date, time: evt.time || "", note: evt.note || "",
        start, remindAt, reminderSent: false, createdAt: serverTimestamp(),
      });
    },
    async updateEvent(id, evt) {
      const uid = currentUser.uid;
      const { start, remindAt } = computeTimes(evt);
      await updateDoc(doc(eventsCol(uid), id), {
        title: evt.title, date: evt.date, time: evt.time || "", note: evt.note || "",
        start, remindAt, reminderSent: false, // reset so an edited time re-notifies
      });
    },
    async deleteEvent(id) {
      await deleteDoc(doc(eventsCol(currentUser.uid), id));
    },

    // Register this device for push + record the timezone the 9am job uses.
    async enableMessaging() {
      if (!messaging) throw new Error("Push not supported here");
      // The app is served from a subpath (e.g. /nova-calendar/), so we must
      // register the FCM service worker at THAT scope and hand it to getToken —
      // otherwise Firebase looks for /firebase-messaging-sw.js at the site root
      // and fails. Using a relative URL keeps it correct on GitHub Pages.
      // Remove any leftover service worker from an earlier version (e.g. a
      // separate firebase-messaging-sw.js) so it can't steal the push subscription.
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        const script = (r.active && r.active.scriptURL) || "";
        if (script && !script.endsWith("/sw.js")) {
          try { await r.unregister(); } catch (_) { /* ignore */ }
        }
      }
      // Use the single app service worker (sw.js) which now also handles FCM.
      const swReg = await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      const token = await getToken(messaging, {
        vapidKey: CONFIG.vapidKey,
        serviceWorkerRegistration: swReg,
      });
      if (!token) throw new Error("No push token");
      await setDoc(userDoc(currentUser.uid), {
        fcmTokens: arrayUnion(token),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, { merge: true });
      return token;
    },
  };

  onAuthStateChanged(auth, (user) => {
    currentUser = user; // Firebase user object (has .uid, .email) or null
    emitAuthChanged();
  });

  window.NovaCloud = NovaCloud;
}
