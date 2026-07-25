/**
 * Sponsor Deck Builder — top-level orchestration + web app entry points.
 *
 * Pulls slides from the master "Blockworks Deck Library" into a custom,
 * per-sponsor deck (a "cart" of catalog items), then exports a PDF.
 * The master deck is READ from constantly (catalog browsing reads it live,
 * every generation copies it fresh) but is NEVER modified — the only
 * operations ever run against MASTER_DECK_ID are reads (Presentations.get /
 * Pages.get) or a Drive copy. Nothing ever calls batchUpdate on it.
 */

// ---- Configuration -------------------------------------------------------

const MASTER_DECK_ID = '1dX2zTRfkz7oqXUW4uLl5_EUuXtTMBt7R36VdMPoFF_8';

// Slide-index range that has been audited and catalogued (1-indexed, as
// shown in the Slides UI). Expand this later to cover the rest of the
// 126-slide library using the same DeckIndexer logic.
const CATALOG_SLIDE_RANGE = { start: 32, end: 69 };

// Informational only — activation slides are actually detected by
// structure (exactly two top-level card groups on the slide), not by this
// range, since the deck's layout can shift. Kept as a rough hint.
const ACTIVATION_SLIDE_RANGE = { start: 50, end: 65 };

const REGISTRY_SHEET_NAME = 'Card Registry';

// Fixed, human-assigned object IDs (see Setup.gs > FIXED_IDS) are used for
// the shell/summary/logo-anchor scaffold elements built fresh into every
// throwaway generation copy — no persistent "working deck" is kept.
const PROP_KEYS = {
  REGISTRY_SPREADSHEET_ID: 'REGISTRY_SPREADSHEET_ID',
  LOGO_ANCHOR_TRANSFORM: 'LOGO_ANCHOR_TRANSFORM',
  LEFT_SLOT_TRANSFORM: 'LEFT_SLOT_TRANSFORM',
  RIGHT_SLOT_TRANSFORM: 'RIGHT_SLOT_TRANSFORM',
  PAGE_SIZE: 'PAGE_SIZE',
};

function getProp_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`Missing script property "${key}".`);
  }
  return value;
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(
    key,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
}

function getPropJson_(key) {
  const raw = getProp_(key);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Property "${key}" is not valid JSON: ${raw.slice(0, 200)}`);
  }
}

// ---- Web app entry points -------------------------------------------------

/**
 * Two things live behind this one endpoint:
 *  - No params (or anything else): the normal cart-building HTML UI.
 *  - ?action=sync&token=<SYNC_TOKEN>: a JSON API for external callers (the
 *    Proposal Platform's Next.js backend) to pull the current catalog,
 *    since google.script.run only works from inside this page's own
 *    browser context, not from another server. Set SYNC_TOKEN once via
 *    setSyncToken_() below before relying on this.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'sync') {
    return handleSyncRequest_(params.token);
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sponsor Deck Builder')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function handleSyncRequest_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected || token !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = runDeckIndexer(MASTER_DECK_ID);
  return ContentService.createTextOutput(JSON.stringify({ rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST endpoint for the Proposal Platform. Currently one action:
 *   { action: 'buildDeck', token, payload } → builds a Slides proposal
 *   from the template deck (see ProposalDeck.gs) and returns its URLs.
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonResponse_({ error: 'Body must be valid JSON.' });
  }

  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected || body.token !== expected) {
    return jsonResponse_({ error: 'Unauthorized' });
  }

  if (body.action !== 'buildDeck') {
    return jsonResponse_({ error: `Unknown action: ${body.action}` });
  }

  try {
    return jsonResponse_(buildProposalDeck(body.payload || {}));
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor (Run ▶ with this function selected) to set the
 * shared secret the Proposal Platform must send as ?token=... to use the
 * sync endpoint. Pick any long random string. */
function setSyncToken_() {
  const token = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('SYNC_TOKEN', token);
  Logger.log(`SYNC_TOKEN set. Give this to the Proposal Platform's env vars: ${token}`);
  return token;
}

/** Allows Index.html to pull in partial files with <?!= include('Foo'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Called from the client. Reads MASTER_DECK_ID live, every time — no
 * cache — so the browse panel always reflects whatever's currently in the
 * master deck, even if it was edited five minutes ago.
 */
function api_getCatalog() {
  return runDeckIndexer(MASTER_DECK_ID);
}

/**
 * Called from the client with the cart contents + deck details.
 * cart: ordered array of catalog item ids (mix of core + activation ids)
 * details: { sponsorName, totalPrice, logoDataUrl }
 * Returns { pdfUrl, slidesUrl }
 */
function api_generateDeck(cart, details) {
  return generateDeck(cart, details);
}
