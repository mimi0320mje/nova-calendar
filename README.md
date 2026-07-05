# Nova Calendar 🌌

A personal calendar PWA with **reliable push reminders** and a friendly
good-morning greeting. Dark drifting-dot background, purple Quicksand buttons.

- ➕ Add dated events (with an optional time + note).
- ⏰ Get a push **5 minutes before** an event — even when the app is closed.
- ☀️ Every morning at **9 AM**: a summary of the day's events, or — on an empty
  day — a warm good-morning with a **non-repeating** inspiring quote.
- ☁️ Log in once; events sync across your phone and any browser in real time.
- 🤖 Ask Claude to add events for you — they appear on your phone in seconds.

## How it's built

Static front-end (no build step) hosted on **GitHub Pages**, backed by **Firebase**:

| Piece | Role |
|---|---|
| `index.html`, `styles.css`, `app.js` | the app UI + calendar logic |
| `background.js` | animated drifting-dots canvas (dodges the mouse) |
| `cloud.js` | Firebase login + real-time event sync (the only file that talks to Firebase) |
| `sw.js` | offline cache, network-first (auto-updates) |
| `firebase-messaging-sw.js` | receives push while the app is closed |
| `functions/` | scheduled Cloud Functions: 5-min reminders + 9 AM summary/quote |
| `tools/add-event.mjs` | admin helper so Claude can add events to your calendar |

Guest mode (events in `localStorage`) works with no setup; logging in turns on
cloud sync + reminders.

## Setup

One-time backend setup is in **[SETUP-firebase.md](SETUP-firebase.md)** — a
click-by-click guide. You'll create a free Firebase project, paste a few public
values into `cloud.js` + `firebase-messaging-sw.js`, and deploy the functions.

## Run locally

```
python3 -m http.server 4183
# open http://localhost:4183
```

> Reminders (push) only work on the deployed HTTPS site once Firebase is set up.
> The calendar itself works locally in guest mode.
