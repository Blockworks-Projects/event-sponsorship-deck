/**
 * Shared helpers: Slides geometry math and presentation fetch/cache.
 *
 * IMPORTANT: never fetch a whole presentation without a `fields` mask. The
 * master deck is 126 graphics-heavy slides — an unrestricted
 * Presentations.get() pulls every style/color/font/theme property for all
 * of them and can exceed Apps Script's memory limit. Prefer
 * fetchSlideIds_() (just IDs) or fetchPageFull_() (one page at a time) —
 * both defined below.
 */

/** Fetches a presentation with an explicit fields mask. `fields` is
 * required on purpose — see the file-level note above. */
function fetchPresentation_(presentationId, fields) {
  if (!fields) throw new Error('fetchPresentation_ requires a fields mask — see Utils.gs.');
  return Slides.Presentations.get(presentationId, { fields });
}

/** Just the ordered list of slide object IDs — cheap regardless of deck size. */
function fetchSlideIds_(presentationId) {
  return fetchPresentation_(presentationId, 'slides.objectId').slides.map((s) => s.objectId);
}

/** Full detail (shapes, text, groups, images) for exactly ONE page. Use
 * this instead of a whole-presentation fetch whenever you need real
 * content, not just IDs. */
function fetchPageFull_(presentationId, pageObjectId) {
  return Slides.Presentations.Pages.get(presentationId, pageObjectId);
}

/**
 * Absolute bounding box of a top-level page element, in EMU, as
 * { x, y, width, height }. Only valid for elements whose transform is
 * relative to the PAGE (i.e. top-level elements, not nested group children,
 * whose transforms are relative to their parent group instead).
 *
 * NOTE: Group elements often come back with no `size` of their own (the API
 * only gives shapes/images a real size) — this returns a zero-size box in
 * that case. Use unionBoundingBox_() across a card's actual member
 * elements instead of relying on a single group's box.
 */
function elementBoundingBoxEMU_(pageElement) {
  const t = pageElement.transform || { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };
  const size = pageElement.size || { width: { magnitude: 0 }, height: { magnitude: 0 } };
  const scaleX = t.scaleX == null ? 1 : t.scaleX;
  const scaleY = t.scaleY == null ? 1 : t.scaleY;
  return {
    x: t.translateX || 0,
    y: t.translateY || 0,
    width: (size.width.magnitude || 0) * scaleX,
    height: (size.height.magnitude || 0) * scaleY,
  };
}

/** Smallest box (in EMU) that encloses all of the given boxes. Boxes with
 * zero width/height (e.g. groups with no own size) are ignored unless
 * ALL boxes are zero-size, in which case they're used as-is (better than
 * throwing). */
function unionBoundingBox_(boxes) {
  const withSize = boxes.filter((b) => b.width > 0 && b.height > 0);
  const use = withSize.length ? withSize : boxes;
  const minX = Math.min(...use.map((b) => b.x));
  const minY = Math.min(...use.map((b) => b.y));
  const maxX = Math.max(...use.map((b) => b.x + b.width));
  const maxY = Math.max(...use.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding box as a fraction of the page size — used for crop rectangles. */
function boundingBoxAsPageFraction_(boxEMU, pageSize) {
  const pageW = pageSize.width.magnitude;
  const pageH = pageSize.height.magnitude;
  return {
    left: boxEMU.x / pageW,
    top: boxEMU.y / pageH,
    width: boxEMU.width / pageW,
    height: boxEMU.height / pageH,
  };
}

/** Concatenates all text runs found anywhere inside a page element,
 * recursing into group children. Returns an array of non-empty trimmed
 * lines (paragraph-ish granularity, split on newlines). */
function extractTextLines_(pageElement) {
  const lines = [];
  walkText_(pageElement, lines);
  return lines.filter((l) => l.trim().length > 0).map((l) => l.trim());
}

function walkText_(el, lines) {
  if (el.shape && el.shape.text && el.shape.text.textElements) {
    let buf = '';
    el.shape.text.textElements.forEach((te) => {
      if (te.textRun) {
        buf += te.textRun.content;
      } else if (te.paragraphMarker) {
        lines.push(buf);
        buf = '';
      }
    });
    if (buf) lines.push(buf);
  }
  if (el.elementGroup && el.elementGroup.children) {
    el.elementGroup.children.forEach((child) => walkText_(child, lines));
  }
}

/** True if a page element is a Group (elementGroup present). */
function isGroup_(pageElement) {
  return !!pageElement.elementGroup;
}

/** Collects every image element's contentUrl found anywhere inside a page
 * element (direct or nested in a group). NOTE: these URLs expire after
 * roughly 30 minutes — only ever use them immediately during a live sync,
 * never store/cache them directly. */
function extractImageUrls_(pageElement) {
  const urls = [];
  walkImages_(pageElement, urls);
  return urls;
}

function walkImages_(el, urls) {
  if (el.image && el.image.contentUrl) {
    urls.push(el.image.contentUrl);
  }
  if (el.elementGroup && el.elementGroup.children) {
    el.elementGroup.children.forEach((child) => walkImages_(child, urls));
  }
}

function getOrCreateRegistrySpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(PROP_KEYS.REGISTRY_SPREADSHEET_ID);
  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (e) {
      // fall through and recreate
    }
  }
  const ss = SpreadsheetApp.create('Sponsor Deck Builder — Card Registry');
  props.setProperty(PROP_KEYS.REGISTRY_SPREADSHEET_ID, ss.getId());
  return ss;
}

const REGISTRY_COLUMNS = [
  'id',
  'label',
  'category', // core | tier-table | activation
  'region', // Asia | London | Both | ''
  'tier', // Presenting | Diamond | Platinum | Gold | ''
  'availability', // e.g. "Available", "On Hold", "2 Available" | ''
  'sourceSlideIndex',
  'sourceSlideObjectId',
  'side', // left | right | '' (n/a for whole-slide items)
  'cardElementIds', // JSON array of every top-level element id making up this card — '' for whole-slide items
  'cardBoxEMU', // JSON {x,y,width,height} — union of cardElementIds' boxes — '' for whole-slide items
  'imageUrls', // JSON array of this card's image contentUrls (expire ~30 min — for immediate sync use only)
  'stagingSlideId', // filled in by CardStager
  'cropFraction', // JSON {left,top,width,height} — filled in by CardStager
  'notes', // free text for human review flags
];

function writeRegistry_(rows) {
  const ss = getOrCreateRegistrySpreadsheet_();
  let sheet = ss.getSheetByName(REGISTRY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(REGISTRY_SHEET_NAME);
  sheet.clear();
  sheet.appendRow(REGISTRY_COLUMNS);
  const data = rows.map((row) =>
    REGISTRY_COLUMNS.map((col) => {
      const value = row[col] ?? '';
      return typeof value === 'object' ? JSON.stringify(value) : value;
    })
  );
  if (data.length) {
    sheet.getRange(2, 1, data.length, REGISTRY_COLUMNS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, REGISTRY_COLUMNS.length);
  return sheet;
}

function loadRegistry_() {
  const ss = getOrCreateRegistrySpreadsheet_();
  const sheet = ss.getSheetByName(REGISTRY_SHEET_NAME);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const header = values.shift();
  return values
    .filter((row) => row[0]) // skip blank trailing rows
    .map((row) => {
      const obj = {};
      header.forEach((col, i) => (obj[col] = row[i]));
      // JSON-decode the columns that store structured data
      ['cardElementIds', 'cardBoxEMU', 'imageUrls', 'cropFraction'].forEach((col) => {
        if (obj[col]) {
          try {
            obj[col] = JSON.parse(obj[col]);
          } catch (e) {
            Logger.log(`Warning: could not parse ${col} for row ${obj.id}: ${String(obj[col]).slice(0, 100)}`);
          }
        }
      });
      return obj;
    });
}

/** Updates specific columns on the registry row matching `id`, in place. */
function updateRegistryRow_(id, patch) {
  const ss = getOrCreateRegistrySpreadsheet_();
  const sheet = ss.getSheetByName(REGISTRY_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  const idCol = header.indexOf('id');
  for (let r = 1; r < values.length; r++) {
    if (values[r][idCol] === id) {
      Object.keys(patch).forEach((key) => {
        const c = header.indexOf(key);
        if (c === -1) return;
        const value = patch[key];
        sheet.getRange(r + 1, c + 1).setValue(
          typeof value === 'object' ? JSON.stringify(value) : value
        );
      });
      return true;
    }
  }
  return false;
}
