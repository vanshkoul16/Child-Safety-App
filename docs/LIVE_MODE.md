# SafeHaven Live Mode

SafeHaven now runs in two clearly separated modes:

| | **Live mode** (default) | **Demo mode** |
|---|---|---|
| Data | Real accounts and real device locations in Supabase | The original prototype: a made-up family with synthetic locations in `localStorage` |
| Labelling | Role tag in the top bar (Guardian / Child device) | Blue "Demo mode" banner on every screen |
| How to switch | Sign-in screen → *Explore the demo*, or Settings → *Switch to demo mode* | Banner → *Use live mode* |

Nothing in demo mode is sent anywhere, and live mode never shows synthetic data.

---

## How it works

```
Child phone (browser)                Supabase (Postgres + Auth + Realtime)          Guardian (browser)
─────────────────────                ────────────────────────────────────          ──────────────────
geolocation.watchPosition ──RPC──▶  submit_location()  validates, rate-limits,
                                     stores fix, evaluates geofences  ──realtime──▶ map, status, zone events
SOS (tap + confirm) ───────RPC──▶  raise_sos()  snapshot of latest fix ──realtime──▶ SOS overlay + alert
          └──────POST /api/live/sos-notify (JWT)──▶ local-server.js ──Web Push──▶ service worker shows it,
                                     (service-role key, VAPID private key)     ◀── posts delivery receipt
```

- **Auth**: Supabase email + password. Role (`parent` / `child`) is chosen at sign-up and fixed by a database trigger; users cannot change it.
- **Linking**: the guardian creates a one-time code (8 characters, 15-minute expiry, only a SHA-256 hash is stored). The **child** enters it on their own signed-in device to complete the link. Wrong codes are throttled (10 per 15 minutes).
- **Authorization** is enforced in Postgres with Row Level Security on every table, plus `SECURITY DEFINER` functions for writes that need validation. The browser only ever holds the public anon key.
- **Realtime** uses Supabase `postgres_changes`, which applies the same RLS policies per subscriber, so a guardian only receives rows for their own linked children.

### Geofencing rules (`submit_location` in the migration)

- Fixes less accurate than **150 m** are stored but never change zone state.
- Fixes older than the newest stored fix (out-of-order delivery) are stored but not evaluated.
- **Enter** when the distance to the centre is ≤ radius. **Exit** only when the distance is > radius + buffer, where buffer = accuracy clamped to 20–100 m. This hysteresis stops jitter at the boundary from producing duplicate alerts.
- The previous inside/outside state is kept per child and zone (`zone_states`). An event is written only when that state changes.
- The first evaluation of a new or edited zone records its state silently (no "arrived" event just because you drew a zone around the child).

### SOS delivery states

| State shown | What it actually means |
|---|---|
| *Saved* | The SOS row exists; guardians see it in their dashboard (and live overlay if open). |
| *Sent to the push service* | The push service (FCM, Mozilla, Apple) accepted it (HTTP 201). |
| *Delivered to your device* | The guardian's service worker displayed the notification and posted a signed receipt. |
| *Acknowledged* | A guardian pressed **Acknowledge**. |

SafeHaven **does not** contact emergency services. Both apps show a `tel:112` button that the person taps themselves.

---

## Local setup

**Prerequisites:** Node.js 20.12+ (uses `process.loadEnvFile`), and Docker Desktop for a local Supabase stack.

```bash
npm install
npm run db:start            # local Supabase in Docker; applies supabase/migrations automatically
npx supabase status         # shows API URL, anon key and service-role key
cp .env.example .env        # fill SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run vapid               # paste the pair into VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, set VAPID_SUBJECT
npm start                   # http://localhost:3000
```

The server prints which live features are configured, for example `Live mode: Supabase configured · server key set · web push on`.

To try both roles on one computer, use two browser profiles, or `http://localhost:3000` for one account and `http://127.0.0.1:3000` for the other (separate storage, so separate sessions).

`npm run db:reset` re-applies the migration and **wipes all local data and accounts**.

## Tests

```bash
npm run lint                # syntax-checks all JS; fails if browser code references a server secret
npm test                    # original demo-logic tests
npm run test:integration    # needs the local Supabase stack running
```

The integration suite (18 tests) covers:
- roles and RLS isolation (anonymous users, other families, children vs parents)
- invite expiry, single use, revocation and brute-force throttling
- location validation and rate limiting
- geofence enter/exit, hysteresis and noise rejection
- SOS idempotency and status changes
- retention and unlinking
- static-file allowlist (no `.env` or source leaks) and `/app-config.js` exposing only public values
- the full Web Push path against a mock push service: it decrypts the payload like a browser would, checks owner-only triggering, no duplicate sends, removal of expired subscriptions, and that receipts cannot be forged or replayed

---

## Hosted Supabase

1. Create a project at [supabase.com](https://supabase.com). Choose a region close to your users.
2. Apply the schema, either:
   - `npx supabase link --project-ref <ref>` then `npm run db:push`, or
   - paste `supabase/migrations/20261022000000_safehaven_live.sql` into the SQL editor and run it once.
3. **Authentication → URL configuration**: set *Site URL* to your app's HTTPS origin, and add it to *Redirect URLs* (used by email-confirmation links).
4. **Authentication → Providers → Email**: keep *Confirm email* on for production. The app shows "check your email" when sign-up returns no session. Set the minimum password length to 8 or more.
5. **Project Settings → API**: copy the URL, the anon/publishable key (public) and the service-role/secret key (**server only**) into your host's environment variables.
6. Realtime is enabled by the migration (`alter publication supabase_realtime add table …`). Check that it is listed under Database → Publications.

## Push notifications

- Generate VAPID keys once (`npm run vapid`) and keep the private key server-side. Changing keys invalidates existing subscriptions, so guardians must re-enable notifications.
- Guardians enable push per device: **Settings → SOS push notifications on this device**.
- Requirements: HTTPS (localhost is exempt) and a browser with a push service. Chrome, Edge and Firefox on desktop and Android work. **iPhone/iPad** needs iOS 16.4+ with SafeHaven **added to the Home Screen** first.
- Embedded or preview browsers often block notifications; the toggle explains this instead of failing silently.

## Map tiles

Live mode uses OpenStreetMap's public tiles by default (with attribution). Their [usage policy](https://operations.osmfoundation.org/policies/tiles/) does not allow heavy production use. For production, set `MAP_TILE_URL` and `MAP_TILE_ATTRIBUTION` to a commercial or self-hosted provider (MapTiler, Stadia, Thunderforest and similar). Demo mode keeps its original tiles.

## Deployment

Live mode needs the Node server (`local-server.js`), because it serves `/app-config.js` and the `/api/live/*` endpoints that hold the service-role and VAPID keys.

- **Render** (already configured via `render.yaml`): add the `SUPABASE_*` and `VAPID_*` variables in the Render dashboard, then deploy. Render provides HTTPS, which phones need for location and push.
- **Any Node host** with HTTPS works the same way (`npm install && npm start`, set `PORT` if required).
- **Vercel**: supported. `vercel.json` builds a `public/` folder containing only the browser files (`scripts/build-vercel.js`), serves `/app-config.js` and `/api/live/*` as serverless functions (`api/app-config.js`, `api/live/*.js`, sharing `server/liveApi.js` with the Node server), and runs a daily Cron (`/api/live/purge`, protected by `CRON_SECRET`) in place of the hourly in-process purge. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET` in Vercel → Settings → Environment Variables, then redeploy. The in-memory API rate limiter is per function instance on Vercel, so it is best-effort there; database-level limits still apply.

The static server only serves `index.html`, `manifest.json`, `sw.js`, `LICENSE` and the `css/`, `js/`, `vendor/` and `assets/` folders. Everything else (including `.env`) returns 404.

## Data protection

- **Minimisation**: raw location fixes are deleted after each child's retention window (default 7 days, 1–30 configurable by a linked guardian). This happens on every new fix and hourly from the server. Guardians and the child can delete history immediately.
- **Kept longer**: SOS records keep the location snapshot that was attached; zone events keep the zone name, distance and accuracy. Both are deleted with the account (`on delete cascade`).
- **Transparency**: the child sees who can see their location, a persistent "Sharing location" indicator whenever it is on, and can pause sharing (guardians see that it was paused).
- **No covert features** in live mode: no camera, microphone or background recording.
- **Legal**: collecting children's location is regulated (e.g. COPPA in the US, GDPR/UK-GDPR Article 8, India's DPDP Act 2023 verifiable parental consent). Review consent, privacy notice and data-processing terms with a qualified advisor before real-world launch.

---

## Feature checklist

### Completed and tested
- [x] Supabase Auth sign-up, sign-in, sign-out, persistent sessions; parent and child roles fixed at sign-up — *integration + browser*
- [x] Expiring, single-use, hashed invite codes; child completes the link; brute-force throttling — *integration + browser*
- [x] RLS on every table; cross-family access blocked for reads and writes; anonymous access blocked — *integration + browser*
- [x] Child location sharing with explicit start, visible indicator, pause, and honest *denied / unavailable / not linked* states reported to guardians — *browser*
- [x] Location validation (ranges, timestamp window), 5-second server rate limit, client throttling, offline retry — *integration*
- [x] Guardian live map (Leaflet + OSM) with accuracy circle, position time, live/stale/offline status, realtime updates — *browser*
- [x] Safe zones create/edit/delete with validation and pick-on-map; enter/exit events with hysteresis, accuracy gating and dedupe — *integration + browser*
- [x] SOS with confirmation dialog and keyboard-accessible cancel, idempotent while open, latest-location snapshot, child cancel, guardian acknowledge/resolve — *integration + browser*
- [x] SOS Web Push to every guardian device; delivery reported only after the device receipt; expired subscriptions cleaned up — *integration (mock push service)*
- [x] Alert history that separates *SOS · sent by child* from *Automatic · safe zone* events — *browser*
- [x] Loading, empty, error/retry, offline, permission-denied and success states — *browser*
- [x] Demo mode preserved and clearly labelled — *browser*
- [x] Retention controls, immediate history deletion, unlink — *integration*
- [x] Static server allowlist (no `.env`/source exposure), security headers, secrets kept server-side — *integration + lint*

### Known limitations
- **Background tracking**: a browser tab only shares location while SafeHaven is open and the screen is on. Continuous background tracking needs a native app (or a Capacitor/React Native wrapper) using OS background-location permissions.
- **Real GPS has not been tested on a phone.** In this environment the browser's location was blocked; the location path was exercised with a test geolocation source in the browser plus database tests.
- **Real browser push has not been tested end-to-end.** The server path was verified against a mock push service with real encryption, but the embedded browser blocks notifications.
- If the child's phone saves the SOS but cannot reach `/api/live/sos-notify` (e.g. it goes offline at that moment), the SOS is stored and appears on open guardian dashboards, but no push is sent. A Supabase Database Webhook calling the notify endpoint would make this independent of the child's connection.
- The API rate limiter in `server/liveApi.js` is in-memory (per process). Use a shared store (e.g. Redis) when running more than one instance. Database-level limits (locations, SOS, invites) are already shared.
- **Not yet in live mode** (still demo-only): route corridors and deviation, turn-by-turn directions, "I'm safe" check-ins, SMS to contacts, SOS audio/video recording, fall detection, safe-zone schedules and restricted zones, location trail history, guardian-raised SOS, password reset.
- Child accounts use email and password. Very young children may need a guardian-managed sign-in flow.

### Needs your credentials or a real device
- [ ] Create a hosted Supabase project, apply the migration, set the Auth URLs and copy the keys (see *Hosted Supabase*).
- [ ] Generate production VAPID keys and set `VAPID_SUBJECT` to a real contact.
- [ ] Choose a production map-tile provider and set `MAP_TILE_URL`.
- [ ] Deploy to an HTTPS host (e.g. Render) with the environment variables.
- [ ] Acceptance run on two real phones: register a guardian and a child, link them, allow location on the child's phone, see it on the guardian's map, walk into and out of a safe zone, send an SOS, and confirm the push arrives and shows *Delivered*.
- [ ] Deny location on the child's phone and confirm the guardian sees *Location blocked*.
- [ ] iPhone: add to Home Screen, enable notifications, repeat the SOS test.
- [ ] Legal and privacy review before real families use it.
