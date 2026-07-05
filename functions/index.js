/* Nova Calendar — Cloud Functions (the piece that actually SENDS notifications).
 *
 * Two scheduled jobs (Firebase Functions v2 + Cloud Scheduler):
 *   1. sendDueReminders  — every minute: 5-minutes-before-event pings.
 *   2. sendDailySummary  — hourly, fires the 9am job per user's timezone:
 *        • events today  → a summary
 *        • empty day     → good-morning + a NON-REPEATING inspiring quote.
 *
 * Data model (written by the app / admin helper):
 *   users/{uid}                     { fcmTokens:[], timezone, usedQuotes:[] }
 *   users/{uid}/events/{id}         { title, date:"YYYY-MM-DD", time, note,
 *                                     start:Timestamp, remindAt:Timestamp,
 *                                     reminderSent:bool }
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { QUOTES } = require("./quotes");

admin.initializeApp();
const db = admin.firestore();

// ---- Helpers ----------------------------------------------------------------

// Send a notification to every device token on a user doc; prune dead tokens.
async function pushToUser(userSnap, title, body, tag) {
  const data = userSnap.data() || {};
  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  if (tokens.length === 0) return;

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { tag: tag || "nova" },
    webpush: { fcmOptions: { link: "/index.html" } },
  });

  // Remove tokens Firebase reports as permanently invalid.
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") {
        dead.push(tokens[i]);
      }
    }
  });
  if (dead.length) {
    await userSnap.ref.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...dead),
    });
  }
}

// "YYYY-MM-DD" and hour-of-day for a given timezone.
function localParts(tz) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// Pick a quote the user hasn't seen yet; reshuffle once all are used.
function pickQuote(used) {
  let seen = Array.isArray(used) ? used.slice() : [];
  if (seen.length >= QUOTES.length) seen = []; // full cycle done → reset
  const remaining = QUOTES.map((_, i) => i).filter((i) => !seen.includes(i));
  const idx = remaining[Math.floor(Math.random() * remaining.length)];
  return { idx, text: QUOTES[idx], newUsed: [...seen, idx] };
}

// ---- 1) 5-minutes-before reminders (every minute) ---------------------------

exports.sendDueReminders = onSchedule(
  { schedule: "every 1 minutes", timeoutSeconds: 120 },
  async () => {
    const now = admin.firestore.Timestamp.now();
    // A small window guards against a missed run without re-sending old ones.
    const floor = admin.firestore.Timestamp.fromMillis(now.toMillis() - 10 * 60 * 1000);

    const due = await db
      .collectionGroup("events")
      .where("reminderSent", "==", false)
      .where("remindAt", "<=", now)
      .where("remindAt", ">=", floor)
      .get();

    if (due.empty) return;

    // Cache user docs so we don't refetch the same user repeatedly.
    const userCache = new Map();
    for (const ev of due.docs) {
      const e = ev.data();
      const userRef = ev.ref.parent.parent; // users/{uid}
      if (!userRef) continue;
      let userSnap = userCache.get(userRef.path);
      if (!userSnap) {
        userSnap = await userRef.get();
        userCache.set(userRef.path, userSnap);
      }
      if (userSnap.exists) {
        const when = e.time ? ` at ${e.time}` : "";
        await pushToUser(userSnap, "⏰ In 5 minutes", `${e.title || "Event"}${when}`, `rem-${ev.id}`);
      }
      await ev.ref.update({ reminderSent: true });
    }
    logger.info(`Sent ${due.size} reminder(s).`);
  }
);

// ---- 2) 9am daily summary / good-morning quote (checked hourly) -------------

exports.sendDailySummary = onSchedule(
  { schedule: "0 * * * *", timeoutSeconds: 120 }, // top of every hour
  async () => {
    const users = await db.collection("users").get();
    for (const userSnap of users.docs) {
      const u = userSnap.data() || {};
      const tz = u.timezone || "UTC";
      const { date, hour } = localParts(tz);
      if (hour !== 9) continue; // only act at the user's local 9am

      const evSnap = await db
        .collection("users").doc(userSnap.id).collection("events")
        .where("date", "==", date).get();

      const events = evSnap.docs
        .map((d) => d.data())
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

      if (events.length > 0) {
        const lines = events.map((e) => `${e.time ? e.time + " " : ""}${e.title}`);
        const body = lines.slice(0, 6).join("\n") + (lines.length > 6 ? `\n+${lines.length - 6} more` : "");
        await pushToUser(userSnap, `☀️ Today — ${events.length} event${events.length > 1 ? "s" : ""}`, body, "summary");
      } else {
        const { text, newUsed } = pickQuote(u.usedQuotes);
        await pushToUser(userSnap, "☀️ Good morning", text, "quote");
        await userSnap.ref.update({ usedQuotes: newUsed });
      }
    }
  }
);
