# Nova Calendar — one-time setup (Firebase)

This turns on **login, cross-device sync, and reliable reminders**. You do it once.
Everything stays **$0** within Firebase's free allowance.

Most steps are clicks on the Firebase website. A few values you'll copy and **paste to
Claude** — Claude puts them in the code for you. You never share your password.

> 💜 **Order matters a little, but don't worry** — just go top to bottom. Tell Claude
> when you hit each "copy this to Claude" step, or if anything looks different.

---

## 0. Install Node.js (needed to deploy the reminder engine)

1. Go to **https://nodejs.org** and download the **LTS** version for macOS.
2. Open the downloaded installer and click through it.
3. That's it — Claude uses it behind the scenes. (This also powers the "Claude adds
   events for you" feature.)

---

## 1. Create your Firebase project

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it **`nova-calendar`**. Click Continue.
4. Google Analytics — you can **turn it off** (not needed). Click **Create project**.
5. Wait for it to finish, then click **Continue**.

---

## 2. Turn on Email/Password login

1. Left sidebar → **Build → Authentication** → **Get started**.
2. On the **Sign-in method** tab, click **Email/Password**.
3. Toggle the first switch **On** (leave "passwordless" off). Click **Save**.

---

## 3. Create the database (Firestore)

1. Left sidebar → **Build → Firestore Database** → **Create database**.
2. Choose a location close to you (e.g. `eur3` or `nam5`). Click **Next**.
3. Pick **Start in production mode** (Claude provides the security rules). Click
   **Create**.

---

## 4. Register the app + copy the config → to Claude

1. Click the **gear icon** (top-left, next to "Project Overview") → **Project settings**.
2. Scroll to **Your apps** → click the **`</>`** (Web) icon.
3. App nickname: **`nova`**. **Don't** check "Firebase Hosting". Click **Register app**.
4. You'll see a code block with `const firebaseConfig = { … }`.
   **Copy the whole `firebaseConfig` block and paste it to Claude.**
   (These values are public and safe to share.)
5. Click **Continue to console**.

---

## 5. Turn on push + copy the key → to Claude

1. Still in **Project settings**, open the **Cloud Messaging** tab.
2. Under **Web configuration → Web Push certificates**, click **Generate key pair**.
3. A long key appears (the "key pair"). **Copy it and paste it to Claude** — this is
   the public VAPID key.

---

## 6. Upgrade to the Blaze plan (required for scheduled reminders)

> This is the one step that needs a card. **It stays $0** — the scheduled reminders use
> a tiny fraction of the free monthly allowance. Google just requires a card on file for
> any project that runs scheduled functions.

1. Bottom-left → click the plan name (**Spark**) → **Upgrade** → **Blaze (Pay as you go)**.
2. Follow the prompts to add a payment method. (Optional: set a **budget alert** of a
   couple dollars for peace of mind — you won't reach it.)

---

## 7. Log in to Firebase from your Mac (for Claude to deploy)

Claude will run these with you — you mainly approve a browser pop-up:

1. Claude installs the Firebase tool (`npm install -g firebase-tools`).
2. Claude runs `firebase login` → a browser opens → **sign in with the same Google
   account** and allow access.

---

## 8. Download the secret key (so Claude can add events for you)

1. **Project settings → Service accounts** tab.
2. Click **Generate new private key** → **Generate key**. A `.json` file downloads.
3. Move that file to the project at **`tools/serviceAccountKey.json`** (Claude will tell
   you the exact spot, or just tell Claude where it downloaded).

> 🔒 This file is a **real secret**. It's already in `.gitignore`, so it will **never** be
> uploaded to GitHub. Keep it only on your Mac.

Also grab your **user id**: **Authentication → Users** → after you sign up in the app,
copy the **User UID** and paste it to Claude (fixes the calendar to your account).

---

## What Claude does with what you paste

- Puts your **firebaseConfig** into `cloud.js` **and** `firebase-messaging-sw.js`.
- Puts your **VAPID key** into `cloud.js`.
- Puts your **project id** into `.firebaserc`, then **deploys** the database rules +
  the two reminder functions.
- Sets your **uid** in the admin helper.

---

## Then — the fun part

1. Open the app, **Sign up** with an email + password.
2. Tap the **🔔 bell** to allow notifications.
3. Add a test event **~6 minutes** from now → you should get a push ~5 min before.
4. **Add to Home Screen** on your phone (on iPhone this is required for push) and repeat.
5. Ask Claude: *"add lunch with Sara tomorrow at 12:30"* → watch it appear on your phone.

Done! 🎉
