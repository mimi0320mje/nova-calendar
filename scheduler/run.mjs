/* Nova Calendar — reminder scheduler (runs on GitHub Actions, free, no Blaze).
 *
 * A GitHub Action runs this every ~5 minutes. It reads events from Firestore and
 * sends push notifications via FCM — all on Firebase's free Spark plan. The paid
 * Blaze plan is NOT needed because the "wake up on a timer" part lives in GitHub
 * Actions instead of a Firebase Cloud Function.
 *
 * Each run does two things:
 *   1. Sends 5-minutes-before reminders for events whose time is near.
 *   2. At ~9am (each user's timezone, once per day) sends the day's summary, or a
 *      non-repeating good-morning quote if the day is empty.
 *
 * Credentials come from the FIREBASE_SERVICE_ACCOUNT env var (a GitHub secret),
 * or a local serviceAccountKey.json when run by hand.
 *
 * Queries use only single-field ranges/equality so Firestore's automatic indexes
 * cover them — no manual composite indexes to create.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { QUOTES } from "./quotes.js";

// How far back to still honour a reminder (guards against a delayed/missed run
// without firing a reminder long after the event has passed).
const WINDOW_MIN = 20;

// ---- credentials ----
let sa;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  sa = JSON.parse(readFileSync(new URL("./serviceAccountKey.json", import.meta.url), "utf8"));
}
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const messaging = getMessaging();

// ---- helpers ----
async function pushToUser(userRef, data, title, body, tag) {
  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  if (tokens.length === 0) return;
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { tag: tag || "nova" },
    webpush: { fcmOptions: { link: "/index.html" } },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") dead.push(tokens[i]);
    }
  });
  if (dead.length) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
}

// "YYYY-MM-DD" + hour-of-day for a timezone.
function localParts(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// Pick a quote the user hasn't seen; reshuffle once all are used.
function pickQuote(used) {
  let seen = Array.isArray(used) ? used.slice() : [];
  if (seen.length >= QUOTES.length) seen = [];
  const remaining = QUOTES.map((_, i) => i).filter((i) => !seen.includes(i));
  const idx = remaining[Math.floor(Math.random() * remaining.length)];
  return { text: QUOTES[idx], newUsed: [...seen, idx] };
}

// ---- main ----
async function run() {
  const now = Timestamp.now();
  const floor = Timestamp.fromMillis(now.toMillis() - WINDOW_MIN * 60 * 1000);

  const users = await db.collection("users").get();
  let sent = 0;

  for (const userSnap of users.docs) {
    const u = userSnap.data() || {};
    const userRef = userSnap.ref;

    // 1) Due reminders — events whose remindAt just passed (single-field range).
    const dueSnap = await userRef.collection("events")
      .where("remindAt", ">=", floor).where("remindAt", "<=", now).get();
    for (const ev of dueSnap.docs) {
      const e = ev.data();
      if (e.reminderSent || !e.remindAt) continue;
      const when = e.time ? ` at ${e.time}` : "";
      await pushToUser(userRef, u, "⏰ Coming up", `${e.title || "Event"}${when}`, `rem-${ev.id}`);
      await ev.ref.update({ reminderSent: true });
      sent++;
    }

    // 2) 9am daily summary / good-morning quote — once per local day.
    const tz = u.timezone || "UTC";
    const { date, hour } = localParts(tz);
    if (hour === 9 && u.lastSummaryDate !== date) {
      const daySnap = await userRef.collection("events").where("date", "==", date).get();
      const events = daySnap.docs.map((d) => d.data())
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      if (events.length > 0) {
        const lines = events.map((e) => `${e.time ? e.time + " " : ""}${e.title}`);
        const body = lines.slice(0, 6).join("\n") + (lines.length > 6 ? `\n+${lines.length - 6} more` : "");
        await pushToUser(userRef, u, `☀️ Today — ${events.length} event${events.length > 1 ? "s" : ""}`, body, "summary");
      } else {
        const { text, newUsed } = pickQuote(u.usedQuotes);
        await pushToUser(userRef, u, "☀️ Good morning", text, "quote");
        await userRef.update({ usedQuotes: newUsed });
      }
      await userRef.update({ lastSummaryDate: date });
      sent++;
    }
  }
  console.log(`Nova scheduler: processed ${users.size} user(s), sent ${sent} notification(s).`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
