# Nova Calendar — setup (Firebase + free GitHub Actions)

Turns on **login, cross-device sync, and reliable reminders** — with **no Blaze plan
and no card**. The reminder scheduler runs on **GitHub Actions** (free for public
repos) instead of paid Firebase functions.

Most steps are clicks on the Firebase website. A couple of values you copy and **paste
to Claude**. You never share your password.

---

## ✅ Already done
- Firebase project **`nova-calendar-b5ecb`** created.
- Email/Password login enabled · Firestore created.
- Web app registered → config pasted to Claude (now in the code).
- Web Push (VAPID) key pasted to Claude.

## Remaining steps

### 1. Paste the database security rules
So the app can read/write **only your own** data.
1. Firebase console → **Build → Firestore Database** → **Rules** tab.
2. Delete what's there and paste the contents of **`firestore.rules`** (Claude will show
   you the block), then click **Publish**.

### 2. Let login work on your live site
1. **Build → Authentication → Settings → Authorized domains → Add domain**.
2. Add **`mimi0320mje.github.io`** → Add. (`localhost` is already there.)

### 3. Download the secret key → give it to Claude
This lets the reminder scheduler send pushes, and lets Claude add events for you.
1. **⚙️ Project settings → Service accounts** tab.
2. **Generate new private key** → **Generate key** → a `.json` file downloads.
3. Tell Claude where it downloaded (usually your **Downloads** folder). Claude will:
   - store it locally (gitignored, never uploaded), and
   - add it as an **encrypted GitHub secret** so the scheduler can run.

> 🔒 The key is a real secret. It never goes into the public repo — only into your Mac
> and GitHub's encrypted secrets.

### 4. (Optional) Install Node.js
Only needed for the "Claude adds events from chat" helper (the reminders don't need it).
Get the **LTS** installer from **https://nodejs.org** and click through it.

---

## What Claude does after you finish
- Sets the `FIREBASE_SERVICE_ACCOUNT` GitHub secret from your key.
- Confirms the **Nova reminders** GitHub Action is live (already in the repo).
- Triggers a test run + helps you send yourself a real reminder.

## Then — the fun part
1. Open the app, **Sign up** with an email + password.
2. Tap the **🔔 bell** to allow notifications.
3. Add a test event a few minutes out → you'll get a push shortly before it.
4. **Add to Home Screen** on your phone (required for push on iPhone) and repeat.
5. Ask Claude: *"add lunch with Sara tomorrow at 12:30"* → watch it appear on your phone.

Done — and $0, no card. 🎉
