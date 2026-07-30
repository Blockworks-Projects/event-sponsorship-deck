# Wiring the New York deck into the builder

The New York (DAS 2027) side of `/builder` exists and works, but it will stay
empty until NYC **offerings** (a tier table + activations) arrive in Supabase
tagged `region = 'nyc'`. Today they don't, because the catalog-sync Apps Script
was only ever placed on the **London/Asia** deck. The NYC deck is currently
wired only to the public *sponsorship deck link* (its rendered slide images,
`deck_pages` with `deck_key = 'nyc'`) — not to the module catalog.

This document is the handoff for extending the sync. **No change to this web app
is required** for the recommended approach; all of it is Apps Script + deck
formatting.

---

## How the builder gets its offerings

```
Google Slides (London/Asia deck)  ──Apps Script action=sync──►  sponsorship_modules
                                                                  (region: london/asia/both)
```

- `POST /api/sync` calls the Apps Script `action=sync` endpoint and **upserts
  every row it returns** into `sponsorship_modules`, keyed by `google_slide_id`.
- The builder reads that table and filters by `region`. The **NYC builder shows
  only `region = 'nyc'` rows** — of which there are currently none.

So: make `action=sync` also return NYC rows, tagged `region: 'nyc'`, and the NYC
builder populates on the next "Sync now". Nothing else to do here.

---

## Recommended approach (no web-app change)

In the Apps Script, have `action=sync` **also index the NYC deck** (the same
deck it already serves for `action=deckPages&deck=nyc`) and **append those rows**
to the response, forcing `region: 'nyc'` on each.

Because NYC is a single event, the deck's slides don't need per-slide region
markers — just override `region = 'nyc'` for every row read from that deck.

Sketch (adapt to the real `Code.gs` / `DeckIndexer.gs`):

```js
// action=sync handler, after building the London/Asia rows:
const rows = indexDeck_(activePresentation);           // existing london/asia rows

const NYC_DECK_ID = '...';                              // the DAS 2027 deck id
const nycRows = indexDeck_(SlidesApp.openById(NYC_DECK_ID))
  .map(r => ({ ...r, region: 'nyc' }));                 // force the region

return json({ rows: rows.concat(nycRows) });
```

The web app's sync route upserts the combined list as-is — done.

> Alternative (needs a small web-app change): expose a separate
> `action=sync&deck=nyc` call, mirroring how `deckPages` is fetched per deck. If
> you prefer that shape, tell me and I'll add the second fetch to
> `src/app/api/sync/route.ts`. The append approach above avoids it.

---

## What each NYC row must contain

Rows follow the same `SyncRow` contract as London/Asia (see
`src/lib/types.ts`). The fields that matter for the builder:

### 1. The NYC tier table — exactly one row

| Field | Value |
|---|---|
| `category` | `"tier-table"` |
| `region` | `"nyc"` |
| `pricing` | `{ "presenting": "$175K", "diamond": "$125K", … }` — keys are **lowercase tier names**, values are the display prices |
| `tierRows` | the benefit rows (see below) |

`tierRows` is an array of `{ label, values }`, where `values` is keyed by
lowercase tier name:

```json
[
  { "label": "Fireside Chat or Keynote", "values": { "presenting": "Main Stage", "diamond": "Track Stage" } },
  { "label": "Event Passes",             "values": { "presenting": "10", "diamond": "6" } },
  { "label": "Branding Package",         "values": { "presenting": "✔", "diamond": "✔" } }
]
```

Notes that make the builder behave:
- A cell of `–`, `—`, or `-` means "this tier does **not** get it" (hidden for
  that tier, offered as an **Add-on**).
- `✔` renders as "Included".
- The tier order shown in the builder is fixed (Presenting → Diamond → Platinum
  → Gold) regardless of key order, so you don't need to order the `pricing` keys.
- The **speaking row must contain "Fireside" or "Keynote" in its label** — that
  is how the builder knows a tier (or an add-on) includes a speaking slot and so
  should offer the *content-details* step.

### 2. NYC activations — one row per activation

| Field | Value |
|---|---|
| `category` | `"activation"` |
| `region` | `"nyc"` |
| `tier` | the tier it belongs to, e.g. `"Presenting"` |
| `label` | the activation title |
| `description`, `bullets`, `imageUrls` | as on London/Asia cards |

---

## NYC deck formatting

The `DeckIndexer` reads specific slide markers (tier-table slide, activation
cards, tokens) — the **same structure the London/Asia deck uses**. The NYC deck
must be built to that same template so the indexer can read it. Whoever authored
the London/Asia deck's structure should replicate it on the NYC deck; the only
difference is that region is forced to `nyc` at index time (above), so no region
markers are needed.

---

## Verifying

1. Deploy the updated Apps Script (Deploy → Manage deployments → New version).
2. In `/builder`, click **Sync now**.
3. Open **New York proposal** — the NYC tiers and activations should now appear.
   If it still says "No tier pricing has synced for New York yet", the
   `action=sync` response isn't yet returning a `region: 'nyc'` tier-table row.
