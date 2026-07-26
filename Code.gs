/**
 * Public Deck Viewer — email-gated, always-current sales deck.
 *
 * How the "always shows the latest version" part works: PUBLISHED_EMBED_URL
 * below points at the deck's "Publish to the web" link (Google Slides >
 * File > Share > Publish to web). That published view is auto-updated by
 * Google itself whenever the source deck is edited — nothing in this
 * script needs to sync anything. This script only handles the email gate
 * and view logging in front of it.
 *
 * SETUP (one-time):
 * 1. Open the master deck in Google Slides.
 * 2. File > Share > Publish to web > Publish. Copy the link it gives you
 *    (looks like https://docs.google.com/presentation/d/e/2PACX-.../pub).
 * 3. Paste that link as PUBLISHED_EMBED_URL below.
 * 4. Deploy this project as a Web App (Execute as: Me, Access: Anyone).
 */

const PUBLISHED_EMBED_URL = 'PASTE_YOUR_PUBLISH_TO_WEB_LINK_HERE';

const ACCESS_LOG_SHEET_NAME = 'Access Log';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Digital Asset Summit — Sponsorship Deck')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Called from the client once the visitor submits their email. Logs the
 * view and returns the embed URL to reveal.
 */
function api_logViewAndGetEmbedUrl(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (PUBLISHED_EMBED_URL.indexOf('PASTE_YOUR') === 0) {
    throw new Error('The deck has not been configured yet — PUBLISHED_EMBED_URL is still a placeholder (see Code.gs setup instructions).');
  }

  logView_(email);
  return PUBLISHED_EMBED_URL;
}

function logView_(email) {
  const sheet = getOrCreateAccessLogSheet_();
  sheet.appendRow([new Date(), email]);
}

function getOrCreateAccessLogSheet_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('ACCESS_LOG_SPREADSHEET_ID');
  let ss;
  if (existingId) {
    try {
      ss = SpreadsheetApp.openById(existingId);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Public Deck Viewer — Access Log');
    props.setProperty('ACCESS_LOG_SPREADSHEET_ID', ss.getId());
  }
  let sheet = ss.getSheetByName(ACCESS_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(ACCESS_LOG_SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Email']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Run this once from the editor to get the Access Log spreadsheet's link. */
function getAccessLogUrl() {
  const url = getOrCreateAccessLogSheet_().getParent().getUrl();
  Logger.log(url);
  return url;
}
