-- ============================================================================
--  DAS Portal — Supabase schema  (replaces the Google Sheet)
-- ----------------------------------------------------------------------------
--  Airtable STAYS the read-only source of sponsor + event data. These tables
--  hold the dynamic app data the Sheet used to hold.
--
--  Every row links to a sponsor via `sponsor_ref` = the Airtable record id of
--  that sponsor's row FOR A GIVEN EVENT. In the front-end this is
--  SESSION.company.id (see Sponsor Portal/api/sponsor.js: `id: rec.id`). Because
--  Airtable has one record per (sponsor, event), this single value uniquely
--  identifies the sponsor AND the event — which is exactly what kills the old
--  name-matching / wrong-event bugs. `sponsor_tag` + `event` are stored too,
--  denormalized, for display and as a stable human-readable fallback key.
--
--  Security: the Vercel /api functions talk to Supabase with the SERVICE ROLE
--  key (server-side only, never in the browser) and enforce "a sponsor only sees
--  their own rows" in code. RLS is ON with no public policies, so the anon key
--  can't read anything — the browser can never hit these tables directly.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── MESSAGES  (3 fixed channels per sponsor+event) ──────────────────────────
create table messages (
  id              uuid primary key default gen_random_uuid(),
  sponsor_ref     text        not null,
  sponsor_tag     text,
  event           text        not null check (event in ('london','nyc','asia')),
  channel         text        not null check (channel in ('Registration','Branding','Logistics')),
  sender          text        not null check (sender in ('admin','sponsor')),
  author          text,
  author_email    text,        -- which teammate sent it (sponsor side), so an admin reply emails only the last sender. EXISTING table: alter table messages add column if not exists author_email text;
  body            text        not null,
  read_by_admin   boolean     not null default false,
  read_by_sponsor boolean     not null default false,
  created_at      timestamptz not null default now()
);
create index messages_thread_idx on messages (sponsor_ref, channel, created_at);

-- ── ANNOUNCEMENTS  (admin → all sponsors of an event, or one) ───────────────
create table announcements (
  id          uuid primary key default gen_random_uuid(),
  event       text        not null check (event in ('london','nyc','asia')),
  title       text        not null,
  body        text,
  target_ref  text,                 -- null/'' = all sponsors for the event; else a sponsor_ref
  created_at  timestamptz not null default now()
);
create index announcements_event_idx on announcements (event, created_at desc);

-- ── ASSETS  (the deliverable / request) ─────────────────────────────────────
create table assets (
  id            uuid primary key default gen_random_uuid(),
  sponsor_ref   text        not null,
  sponsor_tag   text,
  event         text        not null check (event in ('london','nyc','asia')),
  name          text        not null,
  category      text,
  dimensions    text,
  description   text,
  -- requested = admin asked for it; pending = uploaded, awaiting review;
  -- changes = admin asked for edits; approved = signed off.
  status        text        not null default 'requested'
                  check (status in ('requested','pending','changes','approved')),
  requested_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (sponsor_ref, name)
);
create index assets_sponsor_idx on assets (sponsor_ref);

-- ── ASSET FILES  (uploaded versions of an asset) ────────────────────────────
create table asset_files (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid        not null references assets(id) on delete cascade,
  version      int         not null,
  status       text        not null default 'pending'
                 check (status in ('pending','changes','approved')),
  storage_url  text,                 -- Supabase Storage / Blob URL (app copy)
  thumb_url    text,
  drive_url    text,                 -- set once APPROVED → pushed to Google Drive
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
create index asset_files_asset_idx on asset_files (asset_id, version);

-- ── ASSET NOTES  (review thread on an asset) ────────────────────────────────
create table asset_notes (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid        not null references assets(id) on delete cascade,
  sender     text        not null check (sender in ('admin','sponsor')),
  author     text,
  body       text        not null,
  created_at timestamptz not null default now()
);
create index asset_notes_asset_idx on asset_notes (asset_id, created_at);

-- ── BOOTH REQUESTS  (latest row per event+booth = current state) ────────────
create table booth_requests (
  id            uuid primary key default gen_random_uuid(),
  sponsor_ref   text        not null,
  sponsor_tag   text,
  event         text        not null check (event in ('london','nyc','asia')),
  booth_number  text        not null,
  status        text        not null check (status in ('requested','approved','released')),
  created_at    timestamptz not null default now()
);
create index booth_event_idx on booth_requests (event, booth_number, created_at desc);

-- ── SPEAKERS  (sponsor-submitted, admin approves → pushed to Airtable) ──────
create table speakers (
  id            uuid primary key default gen_random_uuid(),
  sponsor_ref   text        not null,
  sponsor_tag   text,
  event         text        not null check (event in ('london','nyc','asia')),
  first_name    text,
  last_name     text,
  full_name     text,
  title         text,
  company       text,
  email         text,
  bio           text,
  headshot_url  text,
  x_handle      text,
  linkedin      text,
  telegram      text,
  availability  text,
  poc1          text,
  poc2          text,
  poc3          text,
  status        text        not null default 'requested'
                  check (status in ('requested','approved','declined')),
  review_note   text,        -- reason shown to the sponsor when a submission is declined
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index speakers_sponsor_idx on speakers (sponsor_ref);

-- ── CODES  (ticket codes issued to a sponsor for an event) ──────────────────
create table codes (
  id            uuid primary key default gen_random_uuid(),
  sponsor_ref   text        not null,
  sponsor_tag   text,
  event         text        not null check (event in ('london','nyc','asia')),
  code          text        not null,
  type          text,                 -- VIP / General (derived from SV/SG prefix)
  created_at    timestamptz not null default now()
);
create index codes_sponsor_idx on codes (sponsor_ref);

-- ── REGISTRATIONS  (who redeemed which code — SOURCED FROM THE LUMA API) ─────
--  Populated by a scheduled/on-demand pull from Luma, matched to `codes.code`.
--  Kept as a cache so the portal reads fast without hitting Luma every time.
create table registrations (
  id            uuid primary key default gen_random_uuid(),
  code          text        not null,
  event         text        check (event in ('london','nyc','asia')),
  guest_name    text,
  guest_email   text,
  registered_at timestamptz,
  synced_at     timestamptz not null default now(),
  unique (code, guest_email)
);
create index registrations_code_idx on registrations (code);

-- ── WELCOME LOG  (who got a welcome email, so admin doesn't resend) ─────────
create table welcome_log (
  id          uuid primary key default gen_random_uuid(),
  scope       text        not null check (scope in ('sponsor','speaker')),
  event       text,
  name        text,
  email       text        not null,
  sent_at     timestamptz not null default now()
);
create index welcome_email_idx on welcome_log (lower(email));

-- ── LOGIN CODES  (passwordless 6-digit sign-in; short-lived) ────────────────
--  Replaces the Apps Script CacheService. A background job (or a cron) deletes
--  expired rows; verification also treats expired rows as invalid.
create table login_codes (
  email       text        not null,
  code        text        not null,
  portal      text        not null check (portal in ('sponsor','speaker')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (email, portal)
);

-- ── SPEAKER CHAT  (speaker ↔ events team; one thread per speaker email) ──────
-- direction: 'in' = from the speaker, 'out' = from the DAS events team.
create table speaker_messages (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,
  name        text,
  event       text        not null default '',
  direction   text        not null check (direction in ('in','out')),
  message     text        not null,
  group_id    uuid,        -- one message fanned out to several recipients (speaker + POCs) shares this, so a merged view shows it once
  sender_email text,       -- who actually sent an inbound message (speaker vs a specific POC), so each portal can label it
  created_at  timestamptz not null default now()
);
create index speaker_messages_email_idx on speaker_messages (lower(email), created_at);

-- ── BOOTH ACCESS  (admin flips "Kiosk selection open" per sponsor+event) ────
-- One row per (sponsor, event). When is_open, that sponsor can pick a Kiosk on
-- their floor plan; otherwise the floor plan is locked ("opens soon"). The admin
-- toggles it once the floor plan is ready for selection.
create table booth_access (
  sponsor_ref  text        not null,
  event        text        not null check (event in ('london','nyc','asia')),
  is_open      boolean     not null default false,
  updated_at   timestamptz not null default now(),
  primary key (sponsor_ref, event)
);

-- ── SHIPMENTS  (sponsor submits a tracking number; admin monitors per account) ─
-- One row per tracking number a sponsor submits, keyed by sponsor_ref + event.
-- The sponsor portal writes here from the Logistics tab; the admin console lists
-- them under each sponsor's account so the team can keep an eye on inbound freight.
create table shipments (
  id              uuid        primary key default gen_random_uuid(),
  sponsor_ref     text        not null,
  sponsor_tag     text,
  event           text        not null check (event in ('london','nyc','asia')),
  item            text,       -- what's in the shipment (e.g. "Booth banner"). EXISTING table: alter table shipments add column if not exists item text;
  carrier         text,
  tracking_number text        not null,
  submitted_by    text,       -- who submitted it (portal user email/name)
  created_at      timestamptz not null default now()
);
create index shipments_sponsor_idx on shipments (sponsor_ref, event, created_at desc);

-- ── PREP CALLS  (admin proposes times per session; speakers respond — a shared poll) ──
-- One prep_calls row per session holds the proposed time slots; each speaker on the
-- session gets one prep_call_responses row (their pick or counter). Everyone on the
-- session sees every response (the "shared poll" view). session_id = Airtable agenda
-- record id. Replaces the earlier Airtable long-text approach.
create table prep_calls (
  session_id   text        primary key,   -- Airtable agenda record id
  event        text,
  slots        jsonb       not null default '[]'::jsonb,   -- [{date,time}], up to 3
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table prep_call_responses (
  session_id     text        not null,
  speaker_email  text        not null,
  speaker_name   text,
  choice         text        check (choice in ('select','other')),
  slot           jsonb,                    -- chosen {date,time} when choice = 'select'
  other_datetime text,                     -- requested date/time when choice = 'other'
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (session_id, speaker_email)
);
create index prep_call_responses_session_idx on prep_call_responses (session_id);

-- ── LOGINS  (per-PERSON portal sign-ins) ────────────────────────────────────
-- One row per person (by email), bumped on every sign-in. This is what powers the
-- admin's "Team & login activity" per handler — the old Airtable "Last Login" only
-- tracked ONE timestamp per company, so it couldn't tell handlers apart. On each
-- login the portal upserts here: last_login = now(), login_count += 1.
create table logins (
  email        text        primary key,
  name         text,
  sponsor_ref  text,                 -- company id the portal knows
  sponsor_tag  text,                 -- company name
  event        text,
  last_login   timestamptz not null default now(),
  login_count  integer     not null default 1,
  created_at   timestamptz not null default now()
);
create index logins_sponsor_idx on logins (sponsor_ref);
create index logins_tag_idx on logins (sponsor_tag);

-- ── SPONSORSHIP MODULES  (synced from the Google Slides deck library) ──────
-- One row per reusable sponsorship "card" (an activation option, or a core
-- content block). google_slide_id is the stable id DeckIndexer.gs assigns
-- (see Sponsor Deck Builder/DeckIndexer.gs) — sync upserts on this key so
-- re-syncing never duplicates a module.
create table sponsorship_modules (
  id             uuid primary key default gen_random_uuid(),
  google_slide_id text       not null unique,
  title          text        not null,
  subtitle       text,
  description    text,
  bullets        jsonb       not null default '[]'::jsonb,
  images         jsonb       not null default '[]'::jsonb,   -- Supabase Storage URLs, never raw Slides contentUrls
  availability   jsonb       not null default '{}'::jsonb,
  tier           text,
  region         text,
  category       text        not null check (category in ('core','tier-table','activation')),
  status         text        not null default 'published'
                   check (status in ('draft','published','archived')),
  display_order  int         not null default 0,
  version        int         not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index sponsorship_modules_category_idx on sponsorship_modules (category, status);

-- ── PROPOSALS  (one per custom client proposal) ─────────────────────────────
create table proposals (
  id             uuid primary key default gen_random_uuid(),
  slug           text        not null unique,
  company        text        not null,
  contact_name   text,
  contact_email  text,
  event          text        check (event in ('london','nyc','asia')),
  total_price    text,
  created_by     text,                 -- rep's email — free text for now, no user accounts yet
  status         text        not null default 'draft' check (status in ('draft','sent')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index proposals_slug_idx on proposals (slug);

-- ── PROPOSAL MODULES  (which modules, in what order — never copies content) ─
create table proposal_modules (
  proposal_id  uuid        not null references proposals(id) on delete cascade,
  module_id    uuid        not null references sponsorship_modules(id) on delete restrict,
  sort_order   int         not null default 0,
  primary key (proposal_id, module_id)
);
create index proposal_modules_proposal_idx on proposal_modules (proposal_id, sort_order);

-- ── DECK VIEWS  (who viewed the public deck or a specific proposal) ─────────
create table deck_views (
  id            uuid        primary key default gen_random_uuid(),
  deck_type     text        not null check (deck_type in ('public','proposal')),
  proposal_id   uuid        references proposals(id) on delete cascade,
  viewer_name   text,
  viewer_email  text        not null,
  viewer_company text,
  user_agent    text,
  session_id    text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index deck_views_proposal_idx on deck_views (proposal_id, started_at desc);

-- ============================================================================
--  Lock everything down: RLS on, no public policies. Only the service_role key
--  (used server-side by the Vercel /api functions) can read/write. The browser
--  never touches Supabase directly.
-- ============================================================================
alter table sponsorship_modules enable row level security;
alter table proposals           enable row level security;
alter table proposal_modules    enable row level security;
alter table deck_views          enable row level security;
alter table messages        enable row level security;
alter table announcements   enable row level security;
alter table assets          enable row level security;
alter table asset_files     enable row level security;
alter table asset_notes     enable row level security;
alter table booth_requests  enable row level security;
alter table speakers        enable row level security;
alter table codes           enable row level security;
alter table registrations   enable row level security;
alter table welcome_log     enable row level security;
alter table login_codes     enable row level security;
alter table speaker_messages enable row level security;
alter table booth_access    enable row level security;
alter table shipments       enable row level security;
alter table prep_calls           enable row level security;
alter table prep_call_responses  enable row level security;
alter table logins               enable row level security;
