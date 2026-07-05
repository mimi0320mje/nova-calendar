/* Nova Calendar — admin helper (Claude adds events to YOUR calendar).
 *
 * This is what lets you say "Claude, add dentist Thursday 3pm" in chat: I run
 * this script, it writes straight into your Firestore using the Admin SDK, and
 * because your phone app listens in real time, the event shows up within seconds
 * and gets the same 5-min + 9am reminders as anything you add by hand.
 *
 * Requires tools/serviceAccountKey.json (downloaded from Firebase — a SECRET,
 * gitignored, never pushed). Run:  npm install   inside tools/  first.
 *
 * Usage:
 *   node add-event.mjs --title "Dentist" --date 2026-07-09 --time 15:00 --note "Bring card"
 *   node add-event.mjs --title "Mum's birthday" --date 2026-07-20        (all-day)
 *   node add-event.mjs --list --date 2026-07-09
 *   node add-event.mjs --delete <eventId>
 *
 * The target account is fixed to NOVA_UID (your single user) — set it below or
 * pass --uid. Find your uid in Firebase console → Authentication → Users.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Your single-user account id. Read from env, or a local gitignored nova-uid.txt,
// so your account id stays OUT of the public repo. Override with --uid if needed.
let NOVA_UID = process.env.NOVA_UID || "PASTE_YOUR_UID";
try {
  const fromFile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "nova-uid.txt"), "utf8").trim();
  if (fromFile) NOVA_UID = fromFile;
} catch { /* no local uid file — rely on env or --uid */ }

// ---- parse flags ----
const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) opt[key] = true;
    else { opt[key] = next; i++; }
  }
}

const uid = opt.uid || NOVA_UID;
if (uid.startsWith("PASTE_")) {
  console.error("✖ Set your uid: edit NOVA_UID in this file or pass --uid <uid>.");
  process.exit(1);
}

// ---- init admin ----
const keyPath = join(__dirname, "serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  console.error(`✖ Missing ${keyPath}. Download it from Firebase → Project settings → Service accounts → Generate new private key.`);
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const eventsCol = db.collection("users").doc(uid).collection("events");

function computeTimes(date, time) {
  if (!time) return { start: null, remindAt: null };
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0, 0);
  return {
    start: Timestamp.fromDate(start),
    remindAt: Timestamp.fromDate(new Date(start.getTime() - 5 * 60 * 1000)),
  };
}

async function main() {
  if (opt.list) {
    let q = eventsCol;
    if (opt.date) q = eventsCol.where("date", "==", opt.date);
    const snap = await q.get();
    if (snap.empty) { console.log("(no events)"); return; }
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
      .forEach((e) => console.log(`${e.date} ${e.time || "     "}  ${e.title}   [${e.id}]`));
    return;
  }

  if (opt.delete) {
    await eventsCol.doc(String(opt.delete)).delete();
    console.log(`✓ Deleted ${opt.delete}`);
    return;
  }

  // default = add
  if (!opt.title || !opt.date) {
    console.error('✖ Need at least --title "…" --date YYYY-MM-DD');
    process.exit(1);
  }
  const date = String(opt.date);
  const time = opt.time && opt.time !== true ? String(opt.time) : "";
  const { start, remindAt } = computeTimes(date, time);
  const id = "e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await eventsCol.doc(id).set({
    title: String(opt.title),
    date,
    time,
    note: opt.note && opt.note !== true ? String(opt.note) : "",
    start,
    remindAt,
    reminderSent: false,
    createdAt: Timestamp.now(),
  });
  console.log(`✓ Added "${opt.title}" on ${date}${time ? " at " + time : " (all-day)"}  [${id}]`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
