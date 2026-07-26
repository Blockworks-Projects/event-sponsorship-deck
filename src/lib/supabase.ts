// src/lib/supabase.ts — shared Supabase client for the Proposal Platform.
//
// Uses the SERVICE ROLE key, which bypasses row-level security. Import this
// ONLY in server-side code (route handlers, server components) — never in a
// 'use client' component, and never expose SUPABASE_SERVICE_KEY to the
// browser. Same pattern as Sponsor Portal/api/_supabase.js — this app
// reuses the SAME Supabase project, just adds new tables to it.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL          e.g. https://xxxxxxxx.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role key (Project Settings → API)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set — Supabase calls will fail.');
}

// Fall back to a syntactically-valid placeholder so createClient doesn't
// throw at import time (e.g. during `next build`'s route analysis, before
// any real env vars are loaded). Any actual call still fails clearly at
// request time if the real env vars are missing.
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
  auth: { persistSession: false },
});
