# SafeHaven sign-in setup: Google and email

Live mode supports two ways to create and use an account, for both **Parent / Guardian** and **Child** accounts:

- **Continue with Google** (Gmail and Google Workspace accounts), through Supabase Auth OAuth with PKCE.
- **Email and password**, with email confirmation, resend, forgot password and reset links.

The code is ready. Google sign-in only starts working after the manual steps below, because they need your Google Cloud and Supabase accounts. Nothing here asks for, or stores, anyone's Google password.

Replace these placeholders throughout:

| Placeholder | Where to find it | Example |
|---|---|---|
| `<project-ref>` | The subdomain of `SUPABASE_URL` in `.env` | `abcdefghijklmnopqrst` |
| `<your-app-domain>` | Your deployed HTTPS domain (Vercel, Render, …) | `safehaven.example.com` |

---

## 1. Apply the database migration (required)

`supabase/migrations/20261115000000_oauth_onboarding.sql` must be applied to the hosted project **before** anyone signs up with Google. Without it, every Google sign-up fails with "Database error saving new user", because the old sign-up trigger requires a role that Google cannot send.

Pick one:

- **SQL editor (simplest):** Supabase dashboard → SQL Editor → New query → paste the whole file → Run. Run it once.
- **CLI:** `npx supabase login`, `npx supabase link --project-ref <project-ref>`, then `npm run db:push`.
  If you applied the first migration through the SQL editor earlier, mark it as applied first so it isn't re-run:
  `npx supabase migration repair --status applied 20261022000000`.

What it changes: email sign-ups behave exactly as before. Google sign-ups create the login without a SafeHaven profile; the user then picks Parent or Child on a one-time setup screen, and the database fixes that role permanently. Every account also gets a public **Parent ID** (`P-XXXX-XXXX`) or **Child ID** (`C-XXXX-XXXX`), and existing accounts receive one automatically.

## 2. Google Cloud Console: create the OAuth client

1. Open [console.cloud.google.com](https://console.cloud.google.com) and create a project (or choose an existing one).
2. Go to **Google Auth Platform** (older consoles: *APIs & Services → OAuth consent screen*) and click **Get started** if prompted.
   - **Branding:** App name `SafeHaven`, a user support email, and a developer contact email. Under **Authorized domains** add `supabase.co` and `<your-app-domain>`'s registrable domain (for example `example.com`).
   - **Audience:** User type **External** (or **Internal** if only your Google Workspace users should sign in). While the app is in **Testing**, only the addresses listed under *Test users* can sign in; add your own accounts there. Click **Publish app** when real families should be able to sign in.
   - **Data Access:** add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are non-sensitive, so no Google security review is needed for them.
3. Go to **Clients → Create client** (older consoles: *Credentials → Create credentials → OAuth client ID*):
   - **Application type:** Web application. **Name:** `SafeHaven web`.
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://<your-app-domain>`
   - **Authorized redirect URIs** (Supabase receives Google's response, not the app):
     - `https://<project-ref>.supabase.co/auth/v1/callback`
     - `http://127.0.0.1:54321/auth/v1/callback` (only if you also want Google on the local Supabase stack)
   - Click **Create**, then copy the **Client ID** and **Client secret**. Keep the secret private; it goes only into Supabase.

## 3. Supabase dashboard: enable Google

1. **Authentication → Sign In / Providers → Google** (older dashboards: *Authentication → Providers*): turn it on.
2. Paste the **Client ID** (in *Client IDs*) and the **Client Secret**. Leave *Skip nonce checks* off. Save.
3. The *Callback URL* shown on that page must exactly match the redirect URI you entered in Google Cloud (`https://<project-ref>.supabase.co/auth/v1/callback`).

## 4. Supabase dashboard: URL configuration

**Authentication → URL Configuration:**

- **Site URL:** `https://<your-app-domain>` in production. While you only develop locally, `http://localhost:3000` is fine.
- **Redirect URLs** (add each):
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`
  - `https://<your-app-domain>/**`
  - Optional, for Vercel preview deployments: `https://*-<your-vercel-team>.vercel.app/**`

The app sends people back to `/?auth=callback` (Google), `/?auth=confirmed` (sign-up email) and `/?auth=recovery` (password reset). Any of those URLs that is not allowed here makes Supabase fall back to the Site URL.

## 5. Supabase dashboard: email and password settings

1. **Authentication → Sign In / Providers → Email:** keep **Confirm email** on. Set **Minimum password length** to 8 or more; optionally set **Password requirements** to *letters and digits* (the app already asks for both).
2. **Custom SMTP (needed for real users):** Supabase's built-in email sender only delivers to your own project team's addresses and is heavily rate-limited. To send confirmation and reset emails to real parents and children, configure **Authentication → Emails → SMTP Settings** with a provider such as Amazon SES, Resend, Postmark or SendGrid.
3. **Optional, recommended: links that work on another device.** By default, confirmation and reset links must be opened in the same browser where the person signed up or asked for the reset (that's how PKCE works). If they will often open the email on a different device, edit **Authentication → Emails → Templates**:
   - *Confirm signup:* set the link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   - *Reset password:* set the link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`

   The app already handles both link styles. Without this change, a confirmation opened elsewhere still confirms the address and the app asks the person to sign in.

## 6. Local development

- With the **hosted** project (`SUPABASE_URL` in `.env` points to `*.supabase.co`): steps 1–5 are all you need. Run `npm start` and open `http://localhost:3000`.
- With the **local** Docker stack (`npm run db:start`): Google is off by default. To turn it on, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in your shell, and restart the stack. The local redirect URLs are already in `config.toml`. The local stack has email confirmation off so tests get a session immediately; emails it does send appear in Mailpit at `http://127.0.0.1:54324`.

No new variables are needed in `.env`. The Google client secret lives only in Supabase, never in this app or the browser.

---

## How it works

```
Sign up with Google (role chosen)       Google account chooser        Supabase Auth                 SafeHaven
─────────────────────────────────       ──────────────────────        ─────────────                 ─────────
role saved locally as a hint ──▶ /auth/v1/authorize?provider=google ──▶ consent ──▶ /auth/v1/callback
                                                                         creates auth user (no profile)
                         ◀──────────────── /?auth=callback&code=… (PKCE, one-time) ◀──┘
exchange code → session → profile?  ── yes ──▶ dashboard for the role stored in the database
                                    └─ no ──▶ "Finish setting up": confirm Parent/Child + name
                                              → complete_onboarding() creates the profile once
```

- **Roles come only from the database.** The role chosen before leaving for Google is just a pre-selection on the setup screen. `complete_onboarding()` validates it, creates the profile once, and refuses any later change. A database trigger blocks role or ID changes from every caller, including the service role.
- **Until setup is finished the account has no access.** Every policy and RPC needs a profile, so an account that cancels setup can't see or do anything. *Cancel and sign out* leaves no session behind; signing in again later shows the setup screen again.
- **Existing accounts never register twice.** If a Google account already has a SafeHaven profile, it goes straight to its dashboard (a different role picked on the sign-up tab is ignored, with a notice).
- **Same email for Google and password:** Supabase links a Google sign-in to an existing account with the same confirmed email, so it is one account with one role.
- **Public IDs are display-only.** There is no lookup by ID, profiles stay visible only to the person and their linked family (row-level security), and linking always needs the guardian's one-time invite code.
- **Cancelled Google consent** returns to the sign-in screen with "Google sign-in was cancelled. Nothing was created or changed." No session is stored.
- **Sessions** are Supabase's: stored in the browser, refreshed automatically, restored on reload, cleared on sign-out.

## Verification status

Tested automatically (`npm run test:integration`, `npm run test:db`) and in the browser against the local Supabase stack:

- Parent and child email registration, password rules, duplicate-email handling, unconfirmed sign-in refused with resend, confirmation link → dashboard, wrong password, sign-out, sign-in again, session restored on reload.
- Forgot password → email → set new password → dashboard; the old password stops working.
- Google path up to Google: the button sends the browser through Supabase to Google's real account chooser (`prompt=select_account`, PKCE). A cancelled consent returns with the cancellation message and no session.
- First-time Google user (no profile): setup screen with the pre-selected role and Google name, validation, *Cancel and sign out*, creation of the Child account and its Child ID, child dashboard.
- Linking with a one-time code; a Parent ID typed as a code is rejected; guardians see pending codes and can cancel them; unrelated families see nothing.
- Demo mode switches in both directions and leaves the live session untouched.

**Not yet tested:** a full sign-in with a real Google account, because that needs your OAuth client from step 2. After steps 1–4, test it with one guardian and one child Gmail account.
