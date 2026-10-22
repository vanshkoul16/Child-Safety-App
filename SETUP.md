# SafeHaven — Setup & Deployment Guide

## Prerequisites
- Node.js ≥ 18
- A [Supabase](https://supabase.com) project (free tier works)
- Git

---

## 1. Clone the repo

```bash
git clone https://github.com/vanshkoul16/Child-Safety-App.git
cd "Child Safety App"
npm install
```

---

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Note your **Project URL** and **anon/public** key from  
   `Project Settings → API`
3. Also copy the **service_role** key (server-only — never commit it)

---

## 3. Run the database schema

1. In the Supabase dashboard → **SQL Editor** → **New query**
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql)
3. Click **Run** — all 8 tables and RLS policies will be created

---

## 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ **Never commit `.env`** — it's already in `.gitignore`

---

## 5. Run locally

```bash
npm run dev
# → http://localhost:3000
```

The local server reads `.env` automatically and injects the Supabase URL + anon key into `index.html` at request time. No build step needed.

---

## 6. Test the full flow

### Register two accounts
1. Open `http://localhost:3000`
2. Click **Register** → create a **Parent** account (e.g. `parent@test.com`)
3. Open a private/incognito window → **Register** → create a **Child** account (e.g. `child@test.com`)

### Link parent ↔ child
1. In the parent window → **Settings** → **Invite a child** → copy the 6-digit code
2. In the child window → enter the code → click **Link account**

### Test real location
1. In the child window → switch to **Child** view
2. Allow location permission when prompted
3. 🟢 Live indicator appears; location is sent to Supabase every 15 s
4. In the parent window → **Map** → the child's pin updates within 10 s

### Test safe zones
1. Parent → **Map** → **Add safe zone** → click a point on the map
2. Move child device outside the radius → zone exit event appears in **Alerts**

### Test SOS
1. Child view → press the **SOS** button → confirm in the dialog
2. Parent window → full-screen SOS overlay appears with child's location
3. Click **View & mark handled** to resolve

### Test unauthorized access
- Log out the parent account → try accessing `GET /api/location?childId=<uuid>` directly  
  → should return `401 Unauthorized`
- Try entering a wrong/expired invite code → should return an error message

---

## 7. Deploy to Vercel

1. Push the `feature/fullstack-supabase` branch (or merge to `main`)
2. In Vercel project → **Settings → Environment Variables** → add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`  
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Vercel auto-deploys on push

> The `vercel.json` already routes all `/api/*.js` as serverless functions.

---

## 8. Deploy to Render

See `render.yaml` — set the same three env vars in Render's dashboard.

---

## Checklist

### ✅ Completed in this PR
- [ ] Supabase schema with RLS on all 8 tables (`supabase/schema.sql`)
- [ ] Auth module: register, login, logout, session persistence (`js/auth.js`)
- [ ] Parent/child role selection at registration
- [ ] Family linking via expiring 6-digit invite codes
- [ ] Auth UI: login/register screens, demo mode (`js/authUI.js`)
- [ ] Real browser geolocation with explicit permission request (`js/locationTracker.js`)
- [ ] GPS fix uploaded to Supabase every 15 s (authenticated)
- [ ] Parent dashboard polls child location every 10 s
- [ ] Stale/offline indicator (no update > 5 min)
- [ ] Demo mode with synthetic route and visible DEMO badge
- [ ] Geofencing: enter/exit events persisted to Supabase with GPS hysteresis (`js/geofenceSync.js`)
- [ ] SOS: confirmation dialog with cancel, authenticated insert, parent polling (`js/sosHandler.js`)
- [ ] Authenticated `POST /api/location` and `GET /api/location` Vercel functions
- [ ] Local server injects Supabase config from `.env` into `index.html`
- [ ] `.env.example` updated with all required variables
- [ ] Auth screen + demo badge + tracking indicator CSS

### ⚠️ Known limitations
- **Background tracking**: A browser tab cannot reliably track location when minimised or screen-locked on iOS/Android. A native mobile app (React Native, Flutter, or a PWA with Background Sync + a persistent wake lock) is required for continuous background tracking.
- **Push notifications**: Not implemented. Requires a push service (FCM/APNs) and a server-side worker to send notifications when an SOS arrives.
- **SMS**: Not implemented. Requires Twilio or a similar provider and a server-side integration.
- **Email confirmation**: Supabase sends a confirmation email on registration. Ensure the redirect URL is configured in Supabase → **Authentication → URL Configuration**.

### 🔜 Next steps
1. Add push notifications via Firebase Cloud Messaging
2. Add SMS via Twilio (server-side only)
3. Replace `watchPosition` polling with a native mobile implementation for background tracking
4. Add rate limiting to `/api/location` (e.g. 1 req / 10 s per child)
5. Add admin dashboard for zone management
