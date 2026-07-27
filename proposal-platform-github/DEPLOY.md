# Deploying the Proposal Platform

## 1. Push the code to GitHub

Vercel deploys from a repo. From this folder:

```bash
git init
git add .
git commit -m "Proposal Platform"
```

Then create an empty repo on GitHub and follow its "push an existing repository"
instructions.

`.env.local` is gitignored and will not be pushed. That is deliberate — the
values go into Vercel directly (step 3), never into the repo.

## 2. Create the Vercel project

New Project → import the repo → **Root Directory: `Proposal Platform`** if you
pushed the whole `DAS Portal` folder, otherwise leave it as the root. Framework
is detected as Next.js; the defaults are correct.

Don't deploy yet — add the environment variables first, or the first build will
succeed but every page will fail at runtime.

## 3. Environment variables

Copy each of these from your local `.env.local` into Vercel → Settings →
Environment Variables, for **Production, Preview and Development**:

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase **service role** key — server-side only, never exposed to a browser |
| `AUTH_SECRET` | Signs sign-in links and session cookies. **Must match what you use locally**, and changing it signs everyone out |
| `SYNC_SOURCE_URL` | The Sponsor Deck Builder Apps Script `/exec` URL. Also how sign-in emails are sent |
| `SYNC_TOKEN` | Shared secret for that script |
| `CRON_SECRET` | Lets the hourly sync run without a browser session |
| `AIRTABLE_TOKEN` | Reads the event agendas |
| `AIRTABLE_BASE` | `appm95Z1bgBJIrUg4` |
| `NEXT_PUBLIC_DECK_EMBED_URL` | Fallback Google Slides embed, used only before a sync has stored the deck pages |

Add one more that has no local equivalent:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | The site's own URL, e.g. `https://your-project.vercel.app` |

This is what sign-in links and the PDF renderer point at. Set it after the first
deploy, when you know the URL, then redeploy. **Update it again the day you move
to a custom domain** — otherwise sign-in emails keep linking to the old address.

## 4. Deploy, then check

- `/builder/login` → enter a Blockworks address → the email arrives from
  `events@blockworks.co`
- `/builder` → the list of proposals
- Open any proposal's tracked link and download its PDF

The PDF route runs headless Chrome. On Fluid compute (Active CPU billing) a
`memory` setting in `vercel.json` is ignored — sizing comes from the project's
compute settings — so don't add one back. If renders fail, the route reports
the real Chrome error in its JSON response; read that before changing config.

## 5. A custom domain, when you have one

Use a **subdomain of an established domain** — `proposals.blockworks.com` —
rather than a new standalone domain. Corporate mail filters score domains on age
and reputation. A domain registered last month, hosting a sign-in page, linked
from an email, is the exact shape of a phishing campaign; a subdomain of a domain
with years of history inherits that history instead. This is the most likely
reason links get blocked today.

Then: Vercel → Settings → Domains → add it, create the CNAME it gives you, and
update `NEXT_PUBLIC_BASE_URL`.

Also worth keeping true:

- Never put the proposal link through a URL shortener. Shorteners are blocked far
  more aggressively than the destination would be.
- Don't add redirect hops. Point DNS straight at Vercel.
- Keep the sponsor-facing URL clean (`/p/uniswap-178c`). No tokens or long query
  strings in a link a client sees.
