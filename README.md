# Orbit

Private location sharing for family and friends. Android app + iPhone web app, one Supabase backend.

- Live map with everyone's location, battery, last seen, weather
- Circles with invite links/codes
- Places (home, school, work) with arrival/departure alerts and location reminders
- 7-day history with timeline and route; driving reports (Android)
- Group chat, check-ins, live ETA sharing
- SOS (hold to send) and crash detection (Android)
- Low-battery alerts, Home Assistant webhook, Android home-screen widget
- Privacy: per-circle sharing, pause, approximate mode, delete history/account

All free services: Supabase, OpenFreeMap tiles, Open-Meteo weather, OSRM routing, Expo push, Web Push.

## How iPhones work without an Apple developer account
- **Orbit web app** (add to Home Screen from Safari): map, chat, SOS, places, notifications. Shares location while open.
- **OwnTracks** (free App Store app): sends location in the background. Set up from Orbit → Settings → iPhone background sharing.

---

## Setup (about 30–40 minutes, once)

### 1. Supabase (database + login)
1. Create a free project at supabase.com.
2. Install the CLI tools and link: `npx supabase login` then `npx supabase link --project-ref YOUR-REF`.
3. Push the database: `npx supabase db push`.
4. Make a web-push key pair: `npx web-push generate-vapid-keys`.
5. Pick a long random secret (any password generator), then set function secrets:
   ```
   npx supabase secrets set NOTIFY_SECRET=your-secret VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
   ```
6. Deploy functions: `npx supabase functions deploy notify` and `npx supabase functions deploy owntracks-ingest`.
7. Open `supabase/setup.sql`, fill in your project URL and the same secret, run it in the SQL Editor.
8. **Login code email:** Authentication → Email Templates → "Magic Link": make the body include `{{ .Token }}` so people get a code.
9. Optional check: run `supabase/tests/privacy.sql` in the SQL editor — every line should say PASS.

### 2. App settings
Copy `.env.example` to `.env` and fill in the Supabase URL, anon key, VAPID public key and web URL.

### 3. iPhone web app (GitHub Pages)
1. Create a GitHub repo called `orbit`, push this folder.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Repo → Settings → Secrets and variables → Actions → **Variables**: add the four `EXPO_PUBLIC_…` values from `.env`.
4. Every push to `main` redeploys `https://YOUR-NAME.github.io/orbit`.

### 4. Android app
1. `npx eas-cli@latest login`, then `npx eas-cli@latest init` (adds the project id for push).
2. Push on Android needs a free Firebase project: follow https://docs.expo.dev/push-notifications/fcm-credentials/ and upload the key with `npx eas-cli@latest credentials`.
3. Build an installable APK: `npx eas-cli@latest build -p android --profile preview`. Open the link on each Android phone to install.

## Develop
```
npm start            # dev server (needs a development build for maps on Android)
npm run web          # web app in the browser
npm run typecheck && npm run lint
```
