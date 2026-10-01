# SafeHaven - Child Safety & Real-Time Monitoring Platform 🛡️👨‍👩‍👧‍👦

SafeHaven is a real-time Child Safety and Live Tracking Progressive Web Application (PWA). It provides dual interfaces for **Parents** and **Children**, featuring live GPS simulation/tracking, dynamic geofencing (Safe Zones / Danger Zones), SOS emergency triggers with audio siren notifications, multi-child switching, battery monitoring, journey replay, and automated background sync.

---

## ✨ Features

### 👨‍👩‍👦 Parent Dashboard
- **Live Interactive Map**: Real-time Leaflet.js-powered map with smooth animations, custom child avatars, and live breadcrumb trail history.
- **Geofence Management**: Configure and visualize Safe Zones (Home, School, Playground) and Danger Zones with instant entry/exit intrusion alerts.
- **SOS Emergency Alerts**: High-priority visual flashing banner, pulse animations, and instant web audio siren alarm.
- **Multi-Child Switcher**: Easily switch between and monitor multiple children (e.g., Aarav, Anaya, Kabir, Sarah) with independent status, speed, and battery tracking.
- **Historical Journey Replay**: Playback recorded route paths with scrubbing and timestamped event logs.
- **Offline & PWA Support**: Fully functional offline caching with Service Workers and local database persistence.

### 🧒 Child Interface
- **One-Touch SOS Emergency Button**: Instantly triggers high-alert status and broadcasts location to parents.
- **Live Safety Status**: Visual indicator of current zone status (In Safe Zone, En Route, Warning).
- **Quick Actions**: "I'm Safe" check-in, "Call Parent", and "Share Live Location".
- **Battery & Device Telemetry**: Auto-broadcasts battery percentage and connection status.

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
