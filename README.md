# SafeHaven — Child Safety & Real-Time Monitoring 🛡️

SafeHaven is a child-safety Progressive Web App (PWA) with two experiences: a **Guardian** dashboard for parents and a calm, distraction-free **Child** app. It covers live GPS tracking, safe zones and hazard zones, route-deviation detection, explainable alerts, turn-by-turn directions to a child, and a 3-second-hold emergency SOS with sirens, push notifications and SMS alerts.

The demo is set in Jammu, J&K, with three children (Anneliese, Anaya and Kabir) and two guardians (Vansh and Isheta Koul).

> **Live mode vs demo mode.** The app now opens in **live mode**: real Supabase accounts for guardians and children, invite-code linking, real device location, server-side geofencing, and SOS with Web Push, all protected by row-level security. The feature tour below describes the original prototype, which is still available as a clearly labelled **demo mode** with synthetic data. Setup, deployment, security model and the full feature checklist are in **[docs/LIVE_MODE.md](docs/LIVE_MODE.md)**.

---

## 📱 Guardian app

Five sections, shown as a sidebar on desktop and a bottom tab bar on phones.

### 1. Home
- Time-of-day greeting with today's date
- **Status card** that changes tone with the family's state (all clear / needs attention / emergency) and leads with the most urgent alert, e.g. *"Safe Zone Departure — Presentation Convent · 12m ago"*, with **Review alert**, **View on map** and **Call** actions
- **Family summary bar** — Safe / Attention / Emergency / Offline counts at a glance
- **Child cards** (24px radius) with current place, battery meter, signal bars and last-sync time
- Quick actions per child: **Live map**, **Call**, **Directions** and **SOS alert** (guardian-raised emergency, with confirmation)
- Recent activity feed and a "Use my location" card for the guardian's own GPS

### 2. Live map
- Pulsing child beacons with **GPS accuracy radius**, colour-coded by status
- Colour-coded safe zones (DPS Jammu, Koul Residence, M.A. Stadium…) and a dashed **hazard perimeter** (Tawi River Edge)
- **Route corridor** for the selected child, plus a **route-deviation banner** showing the real distance off-route (e.g. *"420 m off expected route"*)
- **Navigate to child** with **turn-by-turn directions** (drive time, distance, every step) and a one-tap **Start in Google Maps** hand-off
- Live sync timestamp, Streets / Satellite / Terrain layers, and a control rail (zoom, my location, centre on child, fit everyone, add safe zone)

### 3. Alerts
- Filter chips with counts: **All · Emergency · Safe-zone exits · Route deviations · Low battery · Offline & issues**
- Every alert has a **"Why did I receive this?"** panel with sensor telemetry, severity and a suggested action
- View on map, Call and Dismiss actions

### 4. Family
- Child profiles with device, OS, battery, **signal bars**, GNSS accuracy and pairing PIN; plus Locate, Call and day **Timeline**
- Safe zones list with radius and schedule, **Add zone** (pick the centre on the map) and delete with confirmation
- Assigned routes with their **150 m corridor** and a live **On route / X m off route** indicator
- Emergency contacts directory with **1-tap call and SMS**
- Pair a new device with a one-time code and QR

### 5. Settings & privacy
- Location sharing mode: **Always on / While moving / Emergency only** (saved)
- Alert types: SOS siren (always on), safe-zone entry & exit, route deviation, low battery, offline devices
- **How you're alerted**: **push notifications** (real browser notifications, background-capable via the service worker), **SMS alerts** to SOS contacts, and **siren & alert sounds**
- Location history retention (24 hours / 7 days / 30 days / don't keep), JSON export, and delete-all-history
- Authorized guardians (Vansh Koul — Father, Isheta Koul — Mother), connected devices, and the **privacy promise**: no covert listening, camera access or keystroke logging, ever

---

## 🧒 Child app ("My Safety")

- **Large circular SOS button** — gently pulsing, with a progress ring that fills over a **3-second hold** to prevent false alarms; works with mouse, touch and keyboard
- **Current zone badge** — e.g. *"Safe zone — Delhi Public School (DPS) Jammu"*, or *"Outside safe zones"*
- **I'm safe** — one-tap check-in that notifies parents
- **Call Dad (Vansh)** — direct one-tap call, with "Call someone else" for other contacts
- **Share location** — sends an immediate high-precision GPS ping
- **Safe places** — the zones where the child is covered
- A clear privacy note telling the child exactly what is shared

---

## 🎨 Design

- One design system in `css/app.css`: warm neutral surfaces, an evergreen accent, and tokenised colour, radius, shadow and motion
- **Light and dark themes** (remembered per device), including a dark-tinted map
- Type: **Instrument Serif** for headlines, **Geist** for the interface, **Geist Mono** for coordinates and PINs
- One consistent line-icon set (`js/icons.js`) — no emoji in the UI chrome
- Responsive from 360px phones to wide desktops; modals become bottom sheets on phones
- Respects `prefers-reduced-motion`

---

## 💻 Local quick start

**Prerequisite:** [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/vanshkoul16/Child-Safety-App.git
cd Child-Safety-App
npm install
npm start
```

Then open **http://localhost:3000**. On Windows you can also double-click **`START_SAFEHAVEN.bat`**.

`npm start` runs `local-server.js`, which serves the app and an in-memory version of the `/api` endpoints. To run against MongoDB locally, copy `.env.example` to `.env` and use `vercel dev` instead.

For **live mode** (Supabase + Docker), follow [docs/LIVE_MODE.md → Local setup](docs/LIVE_MODE.md#local-setup). Without Supabase configured, the app opens a sign-in screen that says live mode isn't configured and offers the demo.

### Logic tests

```bash
node test_app_logic.js
```

Covers distance calculation, safety evaluation, SOS trigger and resolve, check-ins, safe-zone create and delete, live GPS assignment and sign-in/out.

### Notes for development
- **Service worker** uses *network-first* for the app's own files, so changes show up on the next reload while the app still works offline. Bump `CACHE_NAME` in `sw.js` when you change the list of pre-cached files.
- App state is stored in `localStorage` (`safehaven_state_v12`). To reset the demo data, clear site data in the browser.
- **Turn-by-turn routing** uses the free public [OSRM](https://project-osrm.org/) server, which is meant for light use; it falls back to an approximate route if unreachable. Use a hosted or self-hosted routing service for production.
- **Push notifications** need the browser's permission; they are unavailable in embedded preview browsers that block notifications.
- Phone calls and SMS from contact and child buttons use `tel:` / `sms:` links (they open the dialer or messages app on a phone). Other call actions and the "SMS sent" confirmation are simulated in this demo.

---

## 🚀 Deployment

### Vercel + MongoDB Atlas (recommended)
The backend runs as Vercel serverless functions in `/api` and stores data in MongoDB Atlas.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?s=https://github.com/vanshkoul16/Child-Safety-App)

1. Import the repository in Vercel (or double-click **`DEPLOY_TO_VERCEL.bat`**).
2. In **Vercel → Project → Settings → Environment Variables**, add `MONGODB_URI` (Atlas connection string) and `MONGODB_DB` (`safehaven`) for Production, Preview and Development.
3. In **Atlas → Network Access**, allow Vercel to connect (`0.0.0.0/0`, since Vercel has no fixed IPs on the free plan).
4. Push to `main`; Vercel redeploys automatically. Check `/api/health` — it should report `"database": "mongodb-atlas"`.

### Render (Node web service)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vanshkoul16/Child-Safety-App)

1. Click the button above or double-click **`DEPLOY_TO_RENDER.bat`**, then sign in with GitHub.
2. Render reads `render.yaml` and configures the service (`node local-server.js`, free plan).
3. Click **Apply**. Note that this runs the local server, so the API uses in-memory storage rather than MongoDB.

---

## 🗂️ Project structure

```
Child-Safety-App/
├── api/                    # Vercel serverless functions (MongoDB Atlas)
│   ├── _db.js              #   Shared database connection
│   ├── health.js           #   GET  /api/health
│   ├── state.js            #   GET  /api/state
│   ├── telemetry.js        #   POST /api/telemetry
│   ├── sos.js              #   POST /api/sos
│   └── checkin.js          #   POST /api/checkin
├── assets/
│   ├── avatars/            # Child profile photos
│   └── icons/              # PWA icons
├── css/
│   └── app.css             # Design system: tokens, components, layouts, themes
├── js/
│   ├── app.js              # Bootstrap, global actions, modals, toasts, SOS overlay, push/SMS
│   ├── state.js            # State store (localStorage) and demo data
│   ├── safetyEngine.js     # Geofence and safety-rule evaluation
│   ├── mapController.js    # Leaflet map, markers, corridors, turn-by-turn routing
│   ├── parentUI.js         # Guardian screens
│   ├── childUI.js          # Child screen and SOS hold logic
│   ├── icons.js            # Line icons and formatting helpers
│   └── audioNotifier.js    # Web Audio sirens and chimes
├── vendor/leaflet/         # Bundled Leaflet library
├── index.html              # App shell
├── sw.js                   # Service worker (offline support)
├── manifest.json           # PWA manifest
├── local-server.js         # Local Node server with in-memory API
├── test_app_logic.js       # Logic test script
├── vercel.json / render.yaml
└── package.json
```

---

## 🛠️ Windows utility scripts

- **`START_SAFEHAVEN.bat`** — starts the local server and opens the browser
- **`STOP_SERVER.bat`** — stops the running Node server
- **`SYNC_GITHUB.bat`** — one-click commit and push helper
- **`ENABLE_AUTOSTART_ON_BOOT.bat`** / **`DISABLE_AUTOSTART.bat`** — start SafeHaven automatically on Windows boot, or stop doing so

---

## 📄 License

[MIT](LICENSE)
