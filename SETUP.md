# Proposal Platform — setup

Google Slides stays the source of truth for all sponsorship content. Nobody
edits copy in Supabase; it's a mirror the sync keeps up to date.

```
Google Slides (Marketing edits)
        │  hourly cron + "Sync now" button
        ▼
Supabase sponsorship_modules  ──►  /p/[slug] tracked web proposal (+ PDF)
                              └─►  Google Slides proposal (from template deck)
```

## 1. Supabase

Apply the four new tables at the bottom of `../supabase/schema.sql`
(`sponsorship_modules`, `proposals`, `proposal_modules`, `deck_views`) to the
same Supabase project the other DAS portals use.

## 2. Apps Script (Sponsor Deck Builder project)

Paste in the updated `Code.gs`, `DeckIndexer.gs`, `Utils.gs`, and the new
`ProposalDeck.gs`. Then:

- Run `setSyncToken_()` once → copy the token it logs.
- Build a template deck and run `setTemplateDeckId_('THE_DECK_ID')`. Full
  instructions are at the top of `ProposalDeck.gs`. In short: **one** slide
  with two cards side by side, marked `[[ACTIVATION_TEMPLATE]]` in its
  speaker notes. Left card's tokens end in `A`, right card's in `B` —
  `{{Title A}}`, `{{Tier A}}`, `{{Bio A}}`, `{{Bullet Points A}}`,
  `{{Photo A1}}`/`{{Photo A2}}`, `{{Event A1}}`/`{{Status A1}}`, … Give it
  the most availability rows any item could need; extras get deleted per
  card. **Group each availability row and each whole card** — that's what
  makes those deletions clean.
- Redeploy as a **Web app** (Deploy → Manage deployments → New version).
  Copy the `/exec` URL.

## 3. Environment variables

Copy `.env.local.example` → `.env.local` locally, and set the same values in
Vercel → Project → Settings → Environment Variables:

| Variable | What it is |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Same project as the other portals |
| `BUILDER_PASSWORD` | Shared password for `/builder` |
| `SYNC_SOURCE_URL` | The Apps Script `/exec` URL |
| `SYNC_TOKEN` | From `setSyncToken_()` |
| `CRON_SECRET` | Any long random string; protects `/api/sync` |
| `NEXT_PUBLIC_BASE_URL` | Production domain (for PDF rendering) |

## 4. First run

1. Deploy to Vercel (new project, root = this folder).
2. Open `/builder`, log in with `BUILDER_PASSWORD`.
3. Click **Sync from Google Slides** — the module library populates.
4. Create a proposal; you'll land on a page offering both the tracked link
   and the Slides version.

Sync also runs hourly via `vercel.json` (needs Vercel Pro for sub-daily
crons).

## Not built yet (deferred from the PRD)

Google-login role separation, admin dashboard, PostHog, Resend email,
CRM integrations, AI recommendations, version/draft workflow, sponsor-portal
handoff.
