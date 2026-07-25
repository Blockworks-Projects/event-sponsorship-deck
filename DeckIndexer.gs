/**
 * M0 — DeckIndexer: walks CATALOG_SLIDE_RANGE in the master deck and builds
 * the first-pass Card Registry (core/tier-table whole-slide items, plus the
 * two activation cards per two-up slide in ACTIVATION_SLIDE_RANGE).
 *
 * Activation cards are NOT built as single grouped objects in this deck —
 * each card is ~12 separate shapes/images (photos, title, description,
 * individual bullet-line rectangles) placed side by side, with only small
 * sub-widgets (the availability-status rows) actually grouped. So a "card"
 * here means: every top-level element on the slide classified to its left
 * or right half by x-position, treated as one unit.
 *
 * This is a heuristic first pass — run it, then open the "Card Registry"
 * spreadsheet (see Utils.gs > getOrCreateRegistrySpreadsheet_) and correct
 * any labels/tiers/regions that got mis-parsed before relying on it. The
 * "notes" column flags rows worth double-checking.
 */

const TIER_KEYWORDS = ['PRESENTING', 'DIAMOND', 'PLATINUM', 'GOLD'];
const REGION_KEYWORDS = ['ASIA', 'LONDON'];

/**
 * Indexes `presentationId` (defaults to the master deck, for a read-only
 * preview run). Always index whichever presentation you're about to
 * operate on — a fresh Drive copy is not guaranteed to preserve object IDs
 * from its source.
 */
function runDeckIndexer(presentationId) {
  presentationId = presentationId || MASTER_DECK_ID;

  // Cheap: just pageSize + the ordered list of slide IDs, not full content.
  const meta = fetchPresentation_(presentationId, 'pageSize,slides.objectId');
  const pageSize = meta.pageSize;
  setProp_(PROP_KEYS.PAGE_SIZE, pageSize);
  const slideIds = meta.slides.map((s) => s.objectId);

  const rows = [];

  slideIds.forEach((slideId, idx) => {
    const slideIndex = idx + 1; // 1-indexed, matches the Slides UI
    if (slideIndex < CATALOG_SLIDE_RANGE.start || slideIndex > CATALOG_SLIDE_RANGE.end) {
      return; // skip fetching full content for slides outside the catalog range entirely
    }

    // Full detail for just this one slide — never the whole 126-slide deck.
    const slide = fetchPageFull_(presentationId, slideId);

    const isActivationSlide =
      slideIndex >= ACTIVATION_SLIDE_RANGE.start && slideIndex <= ACTIVATION_SLIDE_RANGE.end;

    if (isActivationSlide) {
      rows.push(...indexActivationSlide_(slide, slideIndex, pageSize));
    } else {
      rows.push(indexCoreSlide_(slide, slideIndex));
    }
  });

  // Preserve any hand-edited labels from a previous run — re-indexing
  // refreshes structural data (region/tier/geometry) but should never
  // silently discard manual corrections made in the spreadsheet.
  const previousLabels = {};
  loadRegistry_().forEach((r) => { previousLabels[r.id] = r.label; });
  rows.forEach((row) => {
    if (previousLabels[row.id]) row.label = previousLabels[row.id];
  });

  writeRegistry_(rows);
  Logger.log(`Indexed ${rows.length} catalog items from slides ${CATALOG_SLIDE_RANGE.start}-${CATALOG_SLIDE_RANGE.end}.`);
  Logger.log(`Registry spreadsheet: ${getOrCreateRegistrySpreadsheet_().getUrl()}`);
  return rows;
}

// Ground-truth titles for the core/tier-table slides, confirmed against the
// real deck — used instead of the text-guessing heuristic wherever a slide
// number is listed here, since guessTitle_() can grab the wrong line (e.g.
// "Monday" off a schedule slide instead of "Asia Schedule Overview").
const CORE_SLIDE_TITLES = {
  32: 'Welcome Page',
  33: 'Executive Summary',
  34: 'Event Overview',
  35: 'Past DAS Speakers',
  36: 'Expected Participants',
  37: 'Attendee Overview',
  38: 'Asia Content Overview',
  39: 'Asia Attendee Overview',
  40: 'Asia Sponsorship Tiers',
  41: 'Asia Schedule Overview',
  42: 'Section Divider',
  43: 'London Attendee Overview',
  44: 'London Schedule Overview',
  45: 'London Sponsorship Tiers',
  46: 'Kiosk Options',
  47: 'London Content Overview',
  48: 'Branding & Activation',
  49: 'Sponsorship Opportunities Overview',
  66: 'Appendix',
  67: 'Audience Geography',
  68: 'Audience Demographics',
  69: 'Speaker & Sponsor Testimonials',
};

function indexCoreSlide_(slide, slideIndex) {
  const allLines = [];
  (slide.pageElements || []).forEach((el) => allLines.push(...extractTextLines_(el)));

  const label = CORE_SLIDE_TITLES[slideIndex] || guessTitle_(allLines) || `Slide ${slideIndex}`;
  const region = detectRegion_(allLines);
  const tiersFound = TIER_KEYWORDS.filter((t) =>
    allLines.some((l) => l.toUpperCase().includes(t))
  );
  const isTierTable = tiersFound.length >= 2 && allLines.some((l) => /\$[\d,]+/.test(l));

  return {
    id: `core-${slide.objectId}`,
    label,
    category: isTierTable ? 'tier-table' : 'core',
    region,
    tier: tiersFound.join(', '),
    availability: '',
    sourceSlideIndex: slideIndex,
    sourceSlideObjectId: slide.objectId,
    side: '',
    cardElementIds: '',
    cardBoxEMU: '',
    imageUrls: [],
    stagingSlideId: '',
    cropFraction: '',
    notes: allLines.length === 0 ? 'No text found on slide — verify label manually.' : '',
  };
}

/**
 * Splits every top-level element on a two-up activation slide into a left
 * card and a right card by x-position (relative to the page's horizontal
 * midpoint), then treats each half's full element set as one card: union
 * bounding box for geometry, concatenated text for label/tier/region/
 * availability.
 */
function indexActivationSlide_(slide, slideIndex, pageSize) {
  const allElements = slide.pageElements || [];
  const midpointX = pageSize.width.magnitude / 2;

  const halves = { left: [], right: [] };
  allElements.forEach((el) => {
    const box = elementBoundingBoxEMU_(el);
    // Groups often have no own size (box.width === 0) — fall back to their
    // raw x position instead of a center point in that case.
    const classifyX = box.width > 0 ? box.x + box.width / 2 : box.x;
    (classifyX < midpointX ? halves.left : halves.right).push(el);
  });

  const sideNames = ['left', 'right'];
  return sideNames.map((sideName) => {
    const elements = halves[sideName];

    if (!elements.length) {
      return {
        id: `activation-${slide.objectId}-${sideName}-unresolved`,
        label: `Slide ${slideIndex} (${sideName}, unresolved)`,
        category: 'activation',
        region: '',
        tier: '',
        availability: '',
        sourceSlideIndex: slideIndex,
        sourceSlideObjectId: slide.objectId,
        side: sideName,
        cardElementIds: [],
        cardBoxEMU: '',
        imageUrls: [],
        stagingSlideId: '',
        cropFraction: '',
        notes: `No elements found on the ${sideName} half of this slide — needs manual fix.`,
      };
    }

    const lines = [];
    elements.forEach((el) => lines.push(...extractTextLines_(el)));

    // Image contentUrls are only valid for ~30 min — fine to read here since
    // this runs live on every sync, but never cache these long-term (see
    // Proposal Platform's /api/sync, which re-hosts them to Supabase
    // Storage immediately after a sync call).
    const imageUrls = [];
    elements.forEach((el) => imageUrls.push(...extractImageUrls_(el)));

    const box = unionBoundingBox_(elements.map(elementBoundingBoxEMU_));
    const tier = TIER_KEYWORDS.find((t) => lines.some((l) => l.toUpperCase().includes(t))) || '';
    const region = detectRegion_(lines);
    const availability = detectAvailability_(lines);
    const label = guessCardTitle_(lines) || `Card ${slideIndex}-${sideName}`;
    const content = parseCardContent_(lines, label);

    return {
      id: `activation-${slide.objectId}-${sideName}`,
      label,
      category: 'activation',
      region,
      tier,
      availability,
      description: content.description,
      bullets: content.bullets,
      availabilityMap: content.availabilityMap,
      sourceSlideIndex: slideIndex,
      sourceSlideObjectId: slide.objectId,
      side: sideName,
      cardElementIds: elements.map((el) => el.objectId),
      cardBoxEMU: box,
      imageUrls,
      stagingSlideId: '',
      cropFraction: '',
      notes: '',
    };
  });
}

function guessTitle_(lines) {
  // Skip very short/all-caps badge-like lines; prefer the first substantial line.
  const substantial = lines.find((l) => l.length > 4 && !/^[A-Z0-9\s&/]+$/.test(l));
  return substantial || lines[0] || '';
}

function guessCardTitle_(lines) {
  const badgeLike = new Set(
    [...TIER_KEYWORDS, ...REGION_KEYWORDS, 'AVAILABLE', 'ON HOLD'].map((s) => s.toUpperCase())
  );
  const filtered = lines.filter((l) => {
    const upper = l.toUpperCase().trim();
    if (badgeLike.has(upper)) return false;
    if (/^\d+\s+AVAILABLE$/i.test(upper)) return false;
    return true;
  });
  return guessTitle_(filtered);
}

/**
 * Splits a card's raw text lines into description / bullets / per-region
 * availability, for the Proposal Platform's richer sponsorship_modules
 * fields (the cart tool only ever needed the single guessed title). Layout
 * observed across cards: [tier badge] [title] [description] "WHAT'S
 * INCLUDED" [bullet lines] "AVAILABILITY" [region, status, region, status...].
 */
function parseCardContent_(lines, title) {
  const includedIdx = lines.findIndex((l) => /WHAT'?S INCLUDED/i.test(l));
  const availabilityIdx = lines.findIndex((l) => /^AVAILABILITY$/i.test(l.trim()));
  const titleIdx = lines.indexOf(title);

  const badgeLike = new Set(
    [...TIER_KEYWORDS, ...REGION_KEYWORDS, 'AVAILABLE', 'ON HOLD'].map((s) => s.toUpperCase())
  );

  const descEnd = includedIdx !== -1 ? includedIdx : (availabilityIdx !== -1 ? availabilityIdx : lines.length);
  const description = lines
    .slice(titleIdx === -1 ? 0 : titleIdx + 1, descEnd)
    .filter((l) => !badgeLike.has(l.toUpperCase().trim()) && !/^\d+\s+AVAILABLE$/i.test(l.trim()))
    .join(' ')
    .trim();

  let bullets = [];
  if (includedIdx !== -1) {
    const bulletsEnd = availabilityIdx !== -1 ? availabilityIdx : lines.length;
    bullets = lines
      .slice(includedIdx + 1, bulletsEnd)
      .map((l) => l.replace(/^[→➤➔➔➜]\s*/, '').trim())
      .filter(Boolean);
  }

  const availabilityMap = {};
  if (availabilityIdx !== -1) {
    const afterHeader = lines.slice(availabilityIdx + 1);
    for (let i = 0; i < afterHeader.length - 1; i++) {
      const regionMatch = REGION_KEYWORDS.find((r) => afterHeader[i].toUpperCase().trim() === r);
      if (!regionMatch) continue;
      const statusUpper = afterHeader[i + 1].toUpperCase().trim();
      const countMatch = statusUpper.match(/^(\d+)\s+AVAILABLE$/);
      let status = '';
      if (countMatch) status = `${countMatch[1]} Available`;
      else if (statusUpper === 'ON HOLD') status = 'On Hold';
      else if (statusUpper === 'AVAILABLE') status = 'Available';
      if (status) availabilityMap[regionMatch.toLowerCase()] = status;
    }
  }

  return { description, bullets, availabilityMap };
}

function detectRegion_(lines) {
  const upper = lines.join(' ').toUpperCase();
  const found = REGION_KEYWORDS.filter((r) => upper.includes(r));
  if (found.length === 0) return '';
  if (found.length === REGION_KEYWORDS.length) return 'Both';
  return found[0].charAt(0) + found[0].slice(1).toLowerCase();
}

function detectAvailability_(lines) {
  const joined = lines.join(' ');
  const countMatch = joined.match(/(\d+)\s+AVAILABLE/i);
  if (countMatch) return `${countMatch[1]} Available`;
  if (/ON HOLD/i.test(joined)) return 'On Hold';
  if (/\bAVAILABLE\b/i.test(joined)) return 'Available';
  return '';
}
