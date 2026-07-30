-- Base schema for the Proposal Platform, reconstructed from the app's
-- TypeScript types (src/lib/types.ts) and its Supabase queries. Run this ONCE
-- against a fresh Supabase project (SQL Editor → paste → Run). The migrations
-- 002/003/004 in this folder are already folded in here, so a brand-new
-- project only needs this file.
--
-- Uses gen_random_uuid() (pgcrypto, enabled by default on Supabase).

-- ---------------------------------------------------------------------------
-- sponsorship_modules — the card catalog synced from Google Slides.
-- Upserted by /api/sync on google_slide_id.
-- ---------------------------------------------------------------------------
create table if not exists sponsorship_modules (
  id              uuid primary key default gen_random_uuid(),
  google_slide_id text unique not null,
  title           text not null,
  subtitle        text,
  description     text,
  bullets         jsonb not null default '[]'::jsonb,
  images          jsonb not null default '[]'::jsonb,
  availability    jsonb not null default '{}'::jsonb,
  pricing         jsonb not null default '{}'::jsonb,
  tier_rows       jsonb not null default '[]'::jsonb,
  tier            text,
  region          text,
  category        text not null,           -- 'core' | 'tier-table' | 'activation'
  status          text not null default 'published', -- 'draft' | 'published' | 'archived'
  display_order   integer not null default 0,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- proposals — one row per sponsor quote. The tracked /[slug] page reads this.
-- ---------------------------------------------------------------------------
create table if not exists proposals (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  company          text not null,
  contact_name     text,
  contact_email    text,
  event            text,                   -- 'london' | 'nyc' | 'asia' | 'both'
  tier             text,
  tiers            jsonb,
  list_price       text,
  total_override   text,
  discount_percent numeric,
  discount_amount  numeric,
  discounted_price text,
  logo_url         text,
  intro_note       text,
  price_lines      jsonb,
  event_discounts  jsonb,                  -- migration 003
  a_la_carte       jsonb,                  -- migration 004
  include_kiosk    boolean,
  content_session  jsonb,                  -- legacy single session
  content_sessions jsonb,
  total_price      text,
  created_by       text,
  created_by_name  text,
  status           text not null default 'draft', -- 'draft' | 'sent'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- proposal_modules — which cards a proposal includes, and in what order.
-- Rewritten wholesale on each save (delete-then-insert), so a surrogate id
-- keeps it simple and lets the same module appear for more than one event.
-- ---------------------------------------------------------------------------
create table if not exists proposal_modules (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  module_id   uuid not null references sponsorship_modules(id) on delete cascade,
  event       text,
  sort_order  integer not null default 0
);
create index if not exists proposal_modules_proposal_id_idx on proposal_modules (proposal_id);

-- ---------------------------------------------------------------------------
-- deck_views — analytics: who opened a public deck or a proposal.
-- ---------------------------------------------------------------------------
create table if not exists deck_views (
  id             uuid primary key default gen_random_uuid(),
  deck_type      text not null,            -- 'public' | 'proposal'
  proposal_id    uuid references proposals(id) on delete set null,
  deck_key       text,                     -- 'das' | 'nyc'
  viewer_name    text,
  viewer_email   text not null,
  viewer_company text,
  user_agent     text,
  session_id     text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);
create index if not exists deck_views_proposal_id_idx on deck_views (proposal_id);

-- ---------------------------------------------------------------------------
-- deck_pages — re-hosted slide images for the sponsor-facing browse view.
-- Upserted by /api/sync on (deck_key, page_index). deck_key from migration 002.
-- ---------------------------------------------------------------------------
create table if not exists deck_pages (
  deck_key    text not null default 'das',
  page_index  integer not null,
  image_url   text not null,
  updated_at  timestamptz not null default now(),
  primary key (deck_key, page_index)
);
