# SafeHaven - Child Safety & Real-Time Monitoring Platform 🛡️👨‍👩‍👧‍👦

SafeHaven is an Apple Health and modern Fintech-inspired Child Safety and Live Tracking Progressive Web Application (PWA). It provides dual interfaces for **Parents** and **Children**, featuring live GPS tracking, dynamic geofencing (Safe Zones / Hazard Zones), SOS emergency triggers with audio sirens, multi-child monitoring, route deviation detection, battery monitoring, and automated background sync.

---

## 📱 GUI Architecture

### 👨‍💼 Parent App (5 Dedicated Core Navigation Tabs)
1. **🏠 Home Dashboard**:
   - Dynamic greeting (*“Good morning 👋”* / *“Good afternoon 👋”* / *“Good evening 👋”*)
   - Glanceable Family Safety Summary chips (`🟢 2 Safe`, `🟡 1 Attention`, `🔴 0 Emergency`)
   - Soft rounded Child Cards (`24px` radius) with live battery level and last sync timestamp (`🔋 76% • 📍 Updated 1 min ago`)
   - Quick action buttons per child: **[ 🗺️ View Map ]**, **[ 📞 Call ]**, **[ 🚨 SOS Alert ]**
   - Prominent **Urgent Attention Card** highlighting immediate anomalies (*“⚠️ Attention: Aarav left School Safe Zone 12m ago”*)
2. **🗺️ Live Map**:
   - High-precision pulsing child beacons with GPS accuracy radius
   - Color-coded Safe Zones (DPS Jammu, Gandhi Nagar Home, M.A. Stadium) & Hazard perimeter (Tawi River)
   - Real-time route corridor display & **Route Deviation Banner** (*“⚠️ 160m off expected route”*)
   - Prominent **“Navigate to Child”** action with turn-by-turn routing
   - Live synchronization timestamp
3. **🔔 Alerts Center**:
   - Filter chips: `All`, `🔴 Emergency`, `🟡 Safe-Zone Exits`, `⚠️ Route Deviations`, `🔋 Low Battery`, `⚪ Offline/Issues`
   - Detailed **“Why did I receive this?”** explanation card with sensor telemetry and suggested parent actions
4. **👨‍👩‍👧 Children (Kids Management)**:
   - Child profiles with live hardware telemetry (battery, signal bars, GNSS precision)
   - Safe Zones list with radius meters and **[+ Add Zone]** action
   - Assigned routes & corridor boundaries
   - Emergency contacts directory with 1-tap call/sms buttons
5. **⚙️ Settings & Privacy**:
   - Granular Location Sharing (*Always / Moving / SOS Only*)
   - Location History retention controls (*24h / 7d / 30d*)
   - Authorized Guardians management (Vansh Koul - Father, Isheta Koul - Mother)
   - Push notification, SMS, and siren preferences
   - Connected devices and anti-surveillance guarantee (zero mic/camera access)

### 🧒 Child App (“My Safety” — Calm & Distraction-Free)
- **Large Circular SOS Button**: Pulsing red button with 3-second hold progress to prevent false alarms
- **“I'm Safe” 1-Tap Check-In**: Instant reassuring notification to parents
- **Current Safety Zone Badge**: Clear status badge (*“🛡️ You're in a Safe Zone — DPS Jammu”*)
- **“Call Dad (Vansh)”**: Direct 1-tap parental calling
- **“Share Location”**: Broadcasts immediate high-precision GNSS ping
- Clean, distraction-free minimalist layout

---

## 🚀 24/7 Cloud Deployment (Vercel & Render)

### Deploy to Render (Node.js Web Service)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vanshkoul16/Child-Safety-App)

1. Click the **Deploy to Render** button above or double-click **`DEPLOY_TO_RENDER.bat`**.
2. Sign in with GitHub on Render.
3. Render will read `render.yaml` automatically and configure the Node web service.
4. Click **Apply** to deploy your live 24/7 service on `https://safehaven-child-safety.onrender.com`.

### Deploy to Vercel (Edge CDN)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?s=https://github.com/vanshkoul16/Child-Safety-App)

1. Click the **Deploy with Vercel** button above or double-click **`DEPLOY_TO_VERCEL.bat`**.
2. Sign in with GitHub and select your repository: `vanshkoul16/Child-Safety-App`.
3. Click **Deploy**. Vercel will build and assign you a permanent live URL (e.g., `https://child-safety-app.vercel.app`) with automatic updates on every `git push`.

---

## 💻 Local Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or newer recommended)

### 1. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/vanshkoul16/Child-Safety-App.git
cd Child-Safety-App
npm install
```

### 2. Running the Application
Start the Node.js server:
```bash
npm start
```
Or double-click **`START_SAFEHAVEN.bat`** on Windows.

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🗂️ Project Structure

```
Child-Safety-App/
├── assets/
│   ├── avatars/          # Profile avatars for monitored children
│   └── icons/            # PWA icons and web symbols
├── css/
│   ├── style.css         # Core styles & design tokens
│   ├── parent.css        # Parent Dashboard UI styles
│   ├── child.css         # Child SOS interface styles
│   └── map.css           # Map controls & marker animations
├── js/
│   ├── app.js            # Main application bootstrap
│   ├── state.js          # Shared state manager
│   ├── safetyEngine.js   # Geofence detection & safety rule logic
│   ├── mapController.js  # Leaflet map orchestration
│   ├── audioNotifier.js  # Web Audio API emergency sound synthesizer
│   ├── parentUI.js       # Parent view component handlers
│   ├── childUI.js        # Child view component handlers
│   └── simulator.js      # GPS motion & route simulator
├── vendor/
│   └── leaflet/          # Offline Leaflet.js library & assets
├── index.html            # Main Single-Page Application entry
├── server.js             # Express/Node HTTP & WebSocket/REST server
├── manifest.json         # PWA Manifest configuration
├── sw.js                 # Service Worker for offline caching
├── SYNC_GITHUB.bat       # Quick Windows batch script to sync to GitHub
└── package.json          # Project configuration & dependencies
```

---

## 🛠️ Windows Utility Scripts

- **`START_SAFEHAVEN.bat`**: Launches the local server and opens the browser automatically.
- **`STOP_SERVER.bat`**: Gracefully stops the running Node server process.
- **`SYNC_GITHUB.bat`**: 1-click Git commit & push helper script.
- **`ENABLE_AUTOSTART_ON_BOOT.bat`**: Configures SafeHaven to start automatically on Windows boot.
- **`DISABLE_AUTOSTART.bat`**: Removes the auto-start task.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## Cloud Deployment (Vercel + MongoDB Atlas)

The backend runs as Vercel serverless functions in `/api` and stores data in MongoDB Atlas.

1. In Vercel > Project > Settings > Environment Variables, add `MONGODB_URI` (Atlas connection string) and `MONGODB_DB` (`safehaven`) for Production, Preview and Development.
2. In Atlas > Network Access, allow Vercel to connect (`0.0.0.0/0`, since Vercel has no fixed IPs on the free plan).
3. Push to `main`; Vercel redeploys automatically. Check `/api/health` — it should report `"database": "mongodb-atlas"`.

Local run: copy `.env.example` to `.env`, then `vercel dev`. (`node server.js` still serves the static app, but uses the old in-memory API.)
