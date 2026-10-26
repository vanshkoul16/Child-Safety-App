-- ============================================================
-- SafeHaven — Supabase Database Schema
-- Run this in your Supabase project's SQL editor.
-- ============================================================

-- Enable UUID extension (already on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PROFILES — extends auth.users
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- A user can read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- A parent can read profiles of their linked children
CREATE POLICY "profiles_select_linked_child" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = profiles.id
    )
  );

-- ============================================================
-- 2. FAMILIES
-- ============================================================
CREATE TABLE public.families (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "families_owner_all" ON public.families
  FOR ALL USING (owner_id = auth.uid());

-- ============================================================
-- 3. FAMILY MEMBERS — parent ↔ child links
-- ============================================================
CREATE TABLE public.family_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, child_id)
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Parent sees their own links
CREATE POLICY "family_members_parent_select" ON public.family_members
  FOR SELECT USING (parent_id = auth.uid());
-- Child sees their own link
CREATE POLICY "family_members_child_select" ON public.family_members
  FOR SELECT USING (child_id = auth.uid());
-- Parent can create/delete links
CREATE POLICY "family_members_parent_insert" ON public.family_members
  FOR INSERT WITH CHECK (parent_id = auth.uid());
CREATE POLICY "family_members_parent_delete" ON public.family_members
  FOR DELETE USING (parent_id = auth.uid());

-- ============================================================
-- 4. INVITE CODES — 6-digit, expire 24 h
-- ============================================================
CREATE TABLE public.invite_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  parent_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id  UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  used_by    UUID REFERENCES auth.users(id),
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Parent can see/create/delete their own codes
CREATE POLICY "invite_codes_parent_all" ON public.invite_codes
  FOR ALL USING (parent_id = auth.uid());
-- Any authenticated user can look up a code to claim it
CREATE POLICY "invite_codes_lookup" ON public.invite_codes
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 5. LOCATION UPDATES — GPS pings from child device
-- ============================================================
CREATE TABLE public.location_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  accuracy     REAL,            -- metres
  speed        REAL,            -- m/s, nullable
  heading      REAL,            -- degrees, nullable
  altitude     REAL,            -- metres, nullable
  is_demo      BOOLEAN NOT NULL DEFAULT false,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_location_child_time ON public.location_updates (child_id, recorded_at DESC);

-- Child can insert their own location
CREATE POLICY "location_insert_own" ON public.location_updates
  FOR INSERT WITH CHECK (child_id = auth.uid());
-- Child can read own location
CREATE POLICY "location_select_own" ON public.location_updates
  FOR SELECT USING (child_id = auth.uid());
-- Parent can read location of their linked children
CREATE POLICY "location_select_parent" ON public.location_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = location_updates.child_id
    )
  );

-- ============================================================
-- 6. SAFE ZONES — created by parent
-- ============================================================
CREATE TABLE public.safe_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius      REAL NOT NULL CHECK (radius > 0),   -- metres
  icon        TEXT DEFAULT 'shield',
  color       TEXT DEFAULT '#2563eb',
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.safe_zones ENABLE ROW LEVEL SECURITY;

-- Parent can do everything with zones they own
CREATE POLICY "safe_zones_parent_all" ON public.safe_zones
  FOR ALL USING (created_by = auth.uid());
-- Child can read zones for their family
CREATE POLICY "safe_zones_child_select" ON public.safe_zones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.child_id  = auth.uid()
        AND fm.family_id = safe_zones.family_id
    )
  );

-- ============================================================
-- 7. ZONE EVENTS — enter/exit log
-- ============================================================
CREATE TABLE public.zone_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id     UUID NOT NULL REFERENCES public.safe_zones(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('enter', 'exit')),
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.zone_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_zone_events_child ON public.zone_events (child_id, occurred_at DESC);

-- Server-side insert (via service role) only; parents can read
CREATE POLICY "zone_events_parent_select" ON public.zone_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = zone_events.child_id
    )
  );
-- Child can read own zone events
CREATE POLICY "zone_events_child_select" ON public.zone_events
  FOR SELECT USING (child_id = auth.uid());
-- Child inserts their own zone events (triggered by client geofence engine)
CREATE POLICY "zone_events_child_insert" ON public.zone_events
  FOR INSERT WITH CHECK (child_id = auth.uid());

-- ============================================================
-- 8. SOS ALERTS — emergency events
-- ============================================================
CREATE TABLE public.sos_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raised_by    UUID NOT NULL REFERENCES auth.users(id),  -- child or parent
  raise_role   TEXT NOT NULL CHECK (raise_role IN ('child', 'parent')),
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  accuracy     REAL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  resolved_by  UUID REFERENCES auth.users(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sos_child ON public.sos_alerts (child_id, created_at DESC);

-- Child can create their own SOS
CREATE POLICY "sos_child_insert" ON public.sos_alerts
  FOR INSERT WITH CHECK (child_id = auth.uid() AND raised_by = auth.uid());
-- Parent can create SOS on behalf of their child
CREATE POLICY "sos_parent_insert" ON public.sos_alerts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = sos_alerts.child_id
    )
  );
-- Parent can read SOS for their children
CREATE POLICY "sos_parent_select" ON public.sos_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = sos_alerts.child_id
    )
  );
-- Child can read own SOS
CREATE POLICY "sos_child_select" ON public.sos_alerts
  FOR SELECT USING (child_id = auth.uid());
-- Parent can resolve
CREATE POLICY "sos_parent_update" ON public.sos_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.parent_id = auth.uid()
        AND fm.child_id  = sos_alerts.child_id
    )
  );

-- ============================================================
-- Helper: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER safe_zones_updated_at BEFORE UPDATE ON public.safe_zones FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
