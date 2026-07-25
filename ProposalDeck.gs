/**
 * ProposalDeck — builds a real Google Slides proposal from a TEMPLATE deck
 * plus content pulled from the Proposal Platform's database.
 *
 * This does NO crop/split geometry. It never carves content out of the
 * master library deck. You design the template slide in Slides (so it looks
 * exactly how you want) and this fills its tokens in.
 *
 * ── SETTING UP THE TEMPLATE DECK (one-time) ──────────────────────────────
 *
 * 1. Make a Google Slides deck and design it however you like.
 *
 * 2. Static slides (cover, about, pricing, contact...) can use:
 *        {{Sponsor Name}}   {{Total Price}}   {{Contact Name}}   {{Event}}
 *
 * 3. Add ONE slide holding TWO sponsorship cards side by side, and put this
 *    in its SPEAKER NOTES (View > Show speaker notes):
 *        [[ACTIVATION_TEMPLATE]]
 *
 *    The LEFT card's tokens end in A, the RIGHT card's in B:
 *        {{Title A}}      {{Tier A}}    {{Bio A}}    {{Bullet Points A}}
 *        {{Photo A1}}     {{Photo A2}}          ← each in its own box
 *        {{Event A1}}     {{Status A1}}
 *        {{Event A2}}     {{Status A2}}         ← add as many pairs as needed
 *    ...and the same with B for the right-hand card.
 *
 *    Extra spaces inside a token are fine ({{Photo A2 }} works).
 *
 *    Give the template the MAXIMUM number of availability rows any item
 *    could need (two, today). Items with fewer get their extra rows
 *    deleted, so ONE template covers everything — you don't need separate
 *    one-event and two-event versions. That matters because items are
 *    paired two per slide in pick order, so a one-event item will often
 *    land beside a two-event one and no fixed-row template can show both.
 *
 * 4. GROUP THINGS (select > right-click > Group):
 *      - Group each availability row (background + event + status).
 *      - Group each whole card.
 *    Grouping is what lets an unused row or card be removed cleanly.
 *
 * 5. Copy the deck ID from its URL and run:
 *        setTemplateDeckId_('THE_ID')
 */

const TEMPLATE_MARKER = '[[ACTIVATION_TEMPLATE]]';
const GENERATED_PROPOSALS_FOLDER = 'Sponsor Deck Builder — Generated Proposals';

/** Token suffix per card slot, left to right. */
const CARD_SLOTS = ['A', 'B'];

/** How many {{Event <card><n>}} / {{Status <card><n>}} pairs to look for. */
const MAX_AVAILABILITY_ROWS = 6;

/** Run once from the editor, with your template deck's ID pasted in. */
function setTemplateDeckId_(id) {
  if (!id) throw new Error('Pass the template deck id, e.g. setTemplateDeckId_("1AbC...").');
  PropertiesService.getScriptProperties().setProperty('TEMPLATE_DECK_ID', id);
  Logger.log(`TEMPLATE_DECK_ID set to ${id}`);
}

/**
 * payload: {
 *   sponsorName, totalPrice, contactName, event,
 *   modules: [{ title, description, bullets: [], tier, availability, images: [] }]
 * }
 * Returns { slidesUrl, pdfUrl }.
 */
function buildProposalDeck(payload) {
  const templateId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_DECK_ID');
  if (!templateId) {
    throw new Error('TEMPLATE_DECK_ID is not set — run setTemplateDeckId_("...") first (see ProposalDeck.gs).');
  }

  const folder = getOrCreateFolder_(GENERATED_PROPOSALS_FOLDER);
  const name = `Proposal — ${payload.sponsorName || 'Untitled'} — ${new Date().toISOString().slice(0, 10)}`;
  const copy = DriveApp.getFileById(templateId).makeCopy(name, folder);
  const presentation = SlidesApp.openById(copy.getId());

  const templateSlide = findActivationTemplateSlide_(presentation);
  if (!templateSlide) {
    throw new Error(
      `No slide in the template deck has "${TEMPLATE_MARKER}" in its speaker notes — ` +
      'see the setup notes at the top of ProposalDeck.gs.'
    );
  }
  const templateSlideId = templateSlide.getObjectId();

  const modules = payload.modules || [];
  let insertAfter = templateSlide;

  for (let i = 0; i < modules.length; i += CARD_SLOTS.length) {
    const slide = templateSlide.duplicate();
    slide.move(insertAfter.getSlideIndex() + 1);

    CARD_SLOTS.forEach((card, slot) => {
      const mod = modules[i + slot];
      if (mod) {
        fillCard_(slide, mod, card);
      } else {
        removeCard_(slide, card);
      }
    });

    insertAfter = slide;
  }

  // Drop the template slide itself, so its marker and raw tokens never ship.
  presentation.getSlides().forEach((s) => {
    if (s.getObjectId() === templateSlideId) s.remove();
  });

  replaceFlexible_(presentation, fieldRegex_('Sponsor Name'), payload.sponsorName || '');
  replaceFlexible_(presentation, fieldRegex_('Total Price'), payload.totalPrice || '');
  replaceFlexible_(presentation, fieldRegex_('Contact Name'), payload.contactName || '');
  replaceFlexible_(presentation, fieldRegex_('Event'), payload.event || '');

  presentation.saveAndClose();

  const pdfUrl = exportProposalPdf_(copy.getId(), payload.sponsorName, folder);
  return {
    slidesUrl: `https://docs.google.com/presentation/d/${copy.getId()}/edit`,
    pdfUrl,
  };
}

function findActivationTemplateSlide_(presentation) {
  return presentation.getSlides().find((slide) => {
    try {
      const notes = slide.getNotesPage().getSpeakerNotesShape();
      return !!notes && notes.getText().asString().indexOf(TEMPLATE_MARKER) !== -1;
    } catch (e) {
      return false;
    }
  }) || null;
}

// ---- Token patterns -------------------------------------------------------
//
// Built as regexes rather than literal strings so stray whitespace inside a
// token ("{{Photo A2 }}") still matches. The literal text that actually
// matched is what gets replaced, which keeps the shape's formatting intact.

/** e.g. {{Title A}}, {{Sponsor Name}} */
function fieldRegex_(field, card) {
  const name = field.replace(/\s+/g, '\\s+');
  const suffix = card ? `\\s+${card}` : '';
  return new RegExp(`\\{\\{\\s*${name}${suffix}\\s*\\}\\}`, 'i');
}

/** e.g. {{Event A1}}, {{Photo B2}} */
function indexedRegex_(field, card, index) {
  const name = field.replace(/\s+/g, '\\s+');
  return new RegExp(`\\{\\{\\s*${name}\\s+${card}\\s*${index}\\s*\\}\\}`, 'i');
}

/**
 * Replaces the first token matching `regex` inside each shape of `target`
 * (a Slide or Presentation). Uses replaceAllText with the literal matched
 * text so existing run formatting — bullets, bold, colour — survives.
 */
function replaceFlexible_(target, regex, value) {
  const replacement = value == null ? '' : String(value);
  const shapes = target.getSlides
    ? target.getSlides().reduce((acc, s) => acc.concat(allShapes_(s)), [])
    : allShapes_(target);

  shapes.forEach((shape) => {
    const text = shapeTextOrEmpty_(shape);
    if (!text) return;
    const match = text.match(regex);
    if (!match) return;
    try {
      shape.getText().replaceAllText(match[0], replacement, false);
    } catch (e) {
      // not editable — skip
    }
  });
}

// ---- Card filling ---------------------------------------------------------

function fillCard_(slide, mod, card) {
  replaceFlexible_(slide, fieldRegex_('Title', card), mod.title || '');
  replaceFlexible_(slide, fieldRegex_('Tier', card), (mod.tier || '').toUpperCase());
  replaceFlexible_(slide, fieldRegex_('Bio', card), mod.description || '');
  replaceFlexible_(slide, fieldRegex_('Bullet Points', card), (mod.bullets || []).join('\n'));

  fillAvailabilityRows_(slide, mod.availability, card);
  placeImages_(slide, mod.images || [], card);
}

/**
 * Fills {{Event <card><n>}} / {{Status <card><n>}} from however many regions
 * this item actually has, then deletes the leftover rows — so a London-only
 * item shows one row, not one row plus an empty one.
 */
function fillAvailabilityRows_(slide, availability, card) {
  const entries = [];
  if (availability && typeof availability === 'object') {
    Object.keys(availability).forEach((region) => {
      if (availability[region]) {
        entries.push({
          event: region.toUpperCase(),
          status: String(availability[region]).toUpperCase(),
        });
      }
    });
  } else if (typeof availability === 'string' && availability.trim()) {
    entries.push({ event: '', status: availability.toUpperCase() });
  }

  for (let i = 1; i <= MAX_AVAILABILITY_ROWS; i++) {
    const entry = entries[i - 1];
    const eventRe = indexedRegex_('Event', card, i);
    const statusRe = indexedRegex_('Status', card, i);

    if (entry) {
      replaceFlexible_(slide, eventRe, entry.event);
      replaceFlexible_(slide, statusRe, entry.status);
    } else {
      removeElementMatching_(slide, [eventRe, statusRe]);
    }
  }

  if (entries.length > MAX_AVAILABILITY_ROWS) {
    Logger.log(
      `Item has ${entries.length} availability rows but the template only has ` +
      `${MAX_AVAILABILITY_ROWS} slots — extras dropped.`
    );
  }
}

/**
 * Swaps each {{Photo <card><n>}} box for the corresponding image,
 * inheriting that box's exact position and size — placement comes from the
 * template's design, not computed geometry. Unused boxes are removed so raw
 * tokens never ship.
 */
function placeImages_(slide, images, card) {
  const pattern = new RegExp(`^\\s*\\{\\{\\s*photo\\s+${card}\\s*(\\d+)\\s*\\}\\}\\s*$`, 'i');

  allShapes_(slide).forEach((shape) => {
    const match = shapeTextOrEmpty_(shape).match(pattern);
    if (!match) return;

    const imageUrl = images[Number(match[1]) - 1];
    const left = shape.getLeft();
    const top = shape.getTop();
    const width = shape.getWidth();
    const height = shape.getHeight();

    shape.remove();
    if (!imageUrl) return;

    try {
      slide.insertImage(imageUrl, left, top, width, height);
    } catch (e) {
      Logger.log(`Could not insert image ${imageUrl}: ${e.message}`);
    }
  });
}

// ---- Removal --------------------------------------------------------------

/** Removes an entire unused card (odd number of items on the last slide). */
function removeCard_(slide, card) {
  const removed = removeElementMatching_(slide, [fieldRegex_('Title', card)]);

  if (!removed) {
    // Card wasn't grouped — clear its tokens individually so no raw {{...}}
    // ships, even though the empty frame will remain.
    ['Title', 'Tier', 'Bio', 'Bullet Points'].forEach((field) =>
      replaceFlexible_(slide, fieldRegex_(field, card), '')
    );
    Logger.log(
      `Card ${card} was not grouped in the template, so only its text could be ` +
      'cleared — group each card to have unused ones removed entirely.'
    );
  }

  for (let i = 1; i <= MAX_AVAILABILITY_ROWS; i++) {
    removeElementMatching_(slide, [
      indexedRegex_('Event', card, i),
      indexedRegex_('Status', card, i),
    ]);
  }
  placeImages_(slide, [], card);
}

/**
 * Removes whatever holds a matching token: the smallest enclosing GROUP if
 * there is one (the clean case — a grouped row or card), otherwise the
 * token shapes plus any empty background shape sharing their band.
 * Returns true if a group was removed.
 */
function removeElementMatching_(slide, regexes) {
  const groups = [];
  collectGroups_(slide.getPageElements(), groups);

  const matching = groups.filter((group) => {
    const text = groupText_(group);
    return regexes.some((re) => re.test(text));
  });

  if (matching.length) {
    // Innermost wins: a row grouped inside a card removes just the row.
    matching.sort((a, b) => groupText_(a).length - groupText_(b).length);
    matching[0].remove();
    return true;
  }

  const targets = allShapes_(slide).filter((shape) => {
    const text = shapeTextOrEmpty_(shape).trim();
    return regexes.some((re) => re.test(text));
  });
  if (!targets.length) return false;

  const band = verticalBandOf_(targets);
  targets.forEach((shape) => shape.remove());

  // Sweep up the row's background pill, if it's an untouched empty shape.
  allShapes_(slide).forEach((shape) => {
    if (shapeTextOrEmpty_(shape).trim()) return;
    const top = shape.getTop();
    const height = shape.getHeight();
    const overlap = Math.min(top + height, band.bottom) - Math.max(top, band.top);
    if (height > 0 && overlap / height > 0.6) shape.remove();
  });
  return false;
}

// ---- Traversal helpers ----------------------------------------------------

/** All shapes on a slide, INCLUDING those nested inside groups — which
 * slide.getShapes() does not return. */
function allShapes_(slide) {
  const shapes = [];
  collectShapes_(slide.getPageElements(), shapes);
  return shapes;
}

function collectShapes_(elements, out) {
  elements.forEach((el) => {
    const type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) {
      out.push(el.asShape());
    } else if (type === SlidesApp.PageElementType.GROUP) {
      collectShapes_(el.asGroup().getChildren(), out);
    }
  });
}

/** Every group at or below the given elements. */
function collectGroups_(elements, out) {
  elements.forEach((el) => {
    if (el.getPageElementType() === SlidesApp.PageElementType.GROUP) {
      const group = el.asGroup();
      out.push(group);
      collectGroups_(group.getChildren(), out);
    }
  });
}

function groupText_(group) {
  const shapes = [];
  collectShapes_(group.getChildren(), shapes);
  return shapes.map(shapeTextOrEmpty_).join(' ');
}

function verticalBandOf_(shapes) {
  const tops = shapes.map((s) => s.getTop());
  const bottoms = shapes.map((s) => s.getTop() + s.getHeight());
  return { top: Math.min.apply(null, tops), bottom: Math.max.apply(null, bottoms) };
}

function shapeTextOrEmpty_(shape) {
  try {
    return shape.getText().asString();
  } catch (e) {
    return '';
  }
}

// ---- Export ---------------------------------------------------------------

function exportProposalPdf_(presentationId, sponsorName, folder) {
  const url = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
  });
  const name = `Proposal — ${sponsorName || 'Untitled'} — ${new Date().toISOString().slice(0, 10)}.pdf`;
  const file = folder.createFile(response.getBlob().setName(name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}
