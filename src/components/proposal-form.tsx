'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { speakerRole, type SponsorshipModule, type ContentSession, type SessionSpeaker, type Proposal } from '@/lib/types';
import { parsePrice, formatPrice } from '@/lib/pricing';
import { validEmailList } from '@/lib/contacts';
import { AccountPicker, type Account } from '@/components/account-picker';
import { SELLERS } from '@/lib/sellers';
import {
  A_LA_CARTE_EVENTS,
  TICKET_ITEMS,
  catalogFor,
  isSpeaking,
  isTicket,
  type MenuLine,
} from '@/lib/a-la-carte';
import { hidesKioskRow } from '@/lib/kiosk';

/** Cells that mean "this tier doesn't get it" on the source tier table. */
const NOT_INCLUDED = /^[–—-]$/;

/** Tier-chart rows that are section titles, not benefits — never shown as an
 *  inclusion or an add-on. */
const TITLE_ROW = /sponsorship overview/i;

/** The tier-chart row that is a speaking slot. Adding it on earns the event a
 *  content proposal, the same as a Presenting/Diamond tier does. */
const SPEAKING_ROW = /fireside|keynote/i;

// Tiers are stored uppercase on the modules ("PRESENTING") but read better
// capitalised, so every comparison here is case-insensitive. The flat filter
// this replaced compared "Presenting" against "PRESENTING" and so silently
// matched nothing at all.
const TIERS = ['Presenting', 'Diamond', 'Platinum', 'Gold'];
/** Sentinel for "no activation is included in the package" — every picked
 *  activation is charged. */
const NONE_INCLUDED = '__none__';
/** Where a tier sits in the canonical order (Presenting → Gold). Used to sort
 *  tier lists read off a pricing table, whose keys come in no fixed order.
 *  Unknown tiers sort to the end. */
const tierRank = (t: string) => {
  const i = TIERS.findIndex((x) => x.toLowerCase() === t.toLowerCase());
  return i === -1 ? TIERS.length : i;
};
// Chronological: Asia is October, London is November.
const EVENTS = [
  { key: 'asia', label: 'Asia' },
  { key: 'london', label: 'London' },
];
// New York is its own side of the builder: not part of the Asia/London "both"
// flow, but a single-event proposal can be for it — so it joins the list used
// to resolve one event's tiers and activations.
const NYC_EVENT = { key: 'nyc', label: 'New York' };
const ALL_EVENTS = [...EVENTS, NYC_EVENT];

type EventFilter = 'london' | 'asia' | 'both' | 'nyc';

const STEPS = ['Scope', 'Package', 'Add-ons', 'Content', 'Sponsor'];

export function ProposalForm({
  modules,
  existing,
  existingModuleIds,
  signedInAs,
  nycOnly,
}: {
  modules: SponsorshipModule[];
  /** The signed-in rep, used to prefill their own details. */
  signedInAs?: string;
  /** Present when editing rather than creating. */
  existing?: Proposal;
  existingModuleIds?: string[];
  /** The New York side: the event is fixed to NYC and the Asia/London/Both
   *  picker never appears. À la carte isn't offered — NYC has no price list, so
   *  it is package-only. */
  nycOnly?: boolean;
}) {
  const router = useRouter();
  const editing = !!existing;
  // When editing, the picking is already done — open on the details (the last
  // step, Sponsor).
  const [step, setStep] = useState(editing ? 4 : 0);

  // Step 1 — what's being sold. These only narrow what step 2 offers; the
  // proposal's own event and tier are set in step 3.
  const [eventFilter, setEventFilter] = useState<EventFilter>(
    (existing?.event as EventFilter) ?? (nycOnly ? 'nyc' : 'london')
  );

  // Step 2
  // Keyed "event|moduleId": an activation offered at both cities is a
  // separate choice at each, so ticking it for London must not tick Asia.
  const [cart, setCart] = useState<string[]>(existingModuleIds ?? []);
  const cartKey = (eventKey: string, moduleId: string) => `${eventKey}|${moduleId}`;
  const cartModuleId = (key: string) => key.split('|').pop() as string;
  const cartEvent = (key: string) => (key.includes('|') ? key.split('|')[0] : undefined);

  // Step 3 — an optional bespoke session, pulled from the agenda or typed.
  // One optional session per event. A both-events proposal can carry one at
  // each city, or just one; a single-event proposal has at most one.
  type Draft = { include: boolean; heading: string; description: string; title: string; sessionId: string; speakers: SessionSpeaker[] };
  const emptyDraft = (): Draft => ({ include: false, heading: '', description: '', title: '', sessionId: '', speakers: [] });

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    const stored = existing?.content_sessions
      ?? (existing?.content_session ? [existing.content_session] : []);
    stored.forEach((session) => {
      const key = session.event || existing?.event || 'london';
      initial[key] = {
        include: true,
        heading: session.heading ?? '',
        description: session.description ?? '',
        title: session.title ?? '',
        sessionId: '',
        speakers: session.speakers ?? [],
      };
    });
    return initial;
  });

  const draftFor = (key: string) => drafts[key] ?? emptyDraft();
  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [key]: { ...draftFor(key), ...patch } }));

  /** Agenda per event, since a both-events proposal needs both. */
  const [agendas, setAgendas] = useState<Record<string, { id: string; title: string; speakers: SessionSpeaker[] }[]>>({});
  const [agendaLoading, setAgendaLoading] = useState(false);

  // Step 4
  const [company, setCompany] = useState(existing?.company ?? '');
  const [contactName, setContactName] = useState(existing?.contact_name ?? '');
  const [contactEmail, setContactEmail] = useState(existing?.contact_email ?? '');
  const [createdBy, setCreatedBy] = useState(existing?.created_by ?? signedInAs ?? '');
  const [createdByName, setCreatedByName] = useState(existing?.created_by_name ?? '');
  const [logoUrl, setLogoUrl] = useState(existing?.logo_url ?? '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [introNote, setIntroNote] = useState(existing?.intro_note ?? '');

  /**
   * Sponsors we already know about, from the ACCOUNTS table in Airtable.
   * Picking one fills the contact and logo; everything stays editable, and
   * typing a company that isn't on the list is still fine — plenty of records
   * have no handler or logo anyway.
   */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [appliedAccount, setAppliedAccount] = useState<string | null>(null);

  /**
   * Selling a tier, or individual items. À la carte is offered at every event
   * and decided per city: on a both-events proposal one city can be sold item
   * by item while the other is on a tier, or both à la carte. Picks and prices
   * are therefore keyed by "event|itemKey", the same shape the cart uses, so a
   * Meetup Zone bought for London is a separate line from one bought for Asia.
   */
  const menuKey = (eventKey: string, itemKey: string) => `${eventKey}|${itemKey}`;
  // The cities being sold à la carte. Empty means the whole proposal is on
  // tiers; entries are always à la carte-capable events in scope.
  const [menuSel, setMenuSel] = useState<string[]>(
    [...new Set((existing?.a_la_carte ?? []).map((line) => line.event))]
  );
  const [menuPicks, setMenuPicks] = useState<string[]>(
    (existing?.a_la_carte ?? [])
      .filter((line) => !isTicket(line.key))
      .map((line) => menuKey(line.event, line.key))
  );
  const [menuPrices, setMenuPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      (existing?.a_la_carte ?? [])
        .filter((line) => !isTicket(line.key))
        .map((line) => [menuKey(line.event, line.key), String(parsePrice(line.price) ?? '')])
    )
  );
  // GA/VIP pass counts included in an à la carte package, keyed "event|ticketKey".
  // Included, not priced: they show on the proposal as counts but add nothing to
  // the total. A tier bundles these in; an à la carte package sets them by hand.
  const [menuTickets, setMenuTickets] = useState<Record<string, string>>(
    Object.fromEntries(
      (existing?.a_la_carte ?? [])
        .filter((line) => isTicket(line.key) && line.qty != null)
        .map((line) => [menuKey(line.event, line.key), String(line.qty)])
    )
  );
  // A package (tier) city includes one activation; any others the sponsor picks
  // are charged at their à la carte price. This records which picked activation
  // is the included (free) one, per event — defaulting to the first picked.
  const [includedActivation, setIncludedActivation] = useState<Record<string, string>>({});
  /** Is this event being sold item by item rather than as a tier? */
  const onMenuFor = (eventKey: string) => menuSel.includes(eventKey);
  const toggleMenuPick = (eventKey: string, itemKey: string) =>
    setMenuPicks((current) => {
      const key = menuKey(eventKey, itemKey);
      return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/accounts')
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.accounts)) setAccounts(body.accounts);
      })
      // A failed account list shouldn't block making a proposal by hand.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Take on this account's details wholesale — including the blanks. Filling
   * only what the new account knows would leave the previous sponsor's
   * contact sitting under a different company name, which is how a proposal
   * gets sent to the wrong person.
   */
  async function applyAccount(account: Account) {
    setAppliedAccount(account.id);
    setCompany(account.name);
    setContactName(account.contactName ?? '');
    setContactEmail(account.contactEmail ?? '');
    setLogoUrl('');
    if (account.logoUrl) {
      // Airtable's URL expires within hours, so it's copied to our own
      // storage now rather than saved as-is.
      try {
        const res = await fetch('/api/logo/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: account.logoUrl }),
        });
        const body = await res.json();
        if (res.ok && body.url) setLogoUrl(body.url);
      } catch {
        // A missing logo is a cosmetic loss; the rep can upload one.
      }
    }
  }
  // London tiers include a kiosk, so yes is the default. Off simply drops
  // the section from the proposal.
  const [includeKiosk, setIncludeKiosk] = useState(existing?.include_kiosk !== false);
  // Matches the eventFilter default, so the two can't start out of step.
  const [event, setEvent] = useState<string>(existing?.event ?? (nycOnly ? 'nyc' : 'london'));
  const [sponsorTier, setSponsorTier] = useState(existing?.tier ?? '');
  // Both-events proposals buy a tier at each, and they can differ.
  const [tiersByEvent, setTiersByEvent] = useState<Record<string, string>>(existing?.tiers ?? {});
  // ---- Checkout state. Pricing lives in a modal opened from the Sponsor step.
  const [showCheckout, setShowCheckout] = useState(false);
  // Checkout toggle: reveal the catalogue "original" prices beside the offer,
  // or show only what's being offered.
  const [showOriginal, setShowOriginal] = useState(false);
  /** The package-cost line per event, overriding the tier price. Left empty so
   *  it defaults to the tier price; on edit the rep re-itemises if they change
   *  picks, and the saved grand-total override (below) preserves the headline. */
  const [packagePrice, setPackagePrice] = useState<Record<string, string>>({});
  /** A negotiated grand total the rep can type to override the summed lines. */
  const [grandTotalOverride, setGrandTotalOverride] = useState(
    existing?.total_override ?? ''
  );


  // Add-on tweaks to each event's included list: labels removed from, and
  // added on top of, what the tier chart lists. Keyed by event.
  const [overrides, setOverrides] = useState<
    Record<string, { removed: string[]; added: string[] }>
  >(existing?.included_overrides ?? {});

  /** Toggle one benefit label in an event's removed/added list. */
  const toggleOverride = (
    eventKey: string,
    field: 'removed' | 'added',
    label: string
  ) =>
    setOverrides((current) => {
      const entry = current[eventKey] ?? { removed: [], added: [] };
      const list = entry[field];
      const next = list.includes(label)
        ? list.filter((l) => l !== label)
        : [...list, label];
      return { ...current, [eventKey]: { ...entry, [field]: next } };
    });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);

  /** The tiers an event actually sells, read off its pricing table — Asia
   * offers Presenting and Diamond only, so offering Platinum or Gold there
   * would be offering something that doesn't exist. */
  const tiersForEvent = useMemo(() => {
    const tables = modules.filter((m) => m.category === 'tier-table');
    return (eventKey: string): string[] => {
      const table = tables.find((m) => (m.region || '').toLowerCase() === eventKey);
      // Canonical order (Presenting → Gold), not the pricing object's key order.
      return table
        ? Object.keys(table.pricing).sort((a, b) => tierRank(a) - tierRank(b))
        : [];
    };
  }, [modules]);

  const scopeTiers = useMemo(() => {
    const keys =
      eventFilter === 'both'
        ? EVENTS.flatMap((e) => tiersForEvent(e.key))
        : tiersForEvent(eventFilter);
    // Before a sync has run there are no tables to read, so fall back to the
    // full list rather than showing no tiers at all.
    if (!keys.length) return TIERS;
    const available = new Set(keys.map((k) => k.toLowerCase()));
    return TIERS.filter((t) => available.has(t.toLowerCase()));
  }, [tiersForEvent, eventFilter]);
  const activations = useMemo(
    () => modules.filter((m) => m.category === 'activation'),
    [modules]
  );

  // Every activation a city sells, from the synced deck. "both" means London +
  // Asia (the 2026 cities), never New York. Used to find the card behind a
  // catalogue item and to price a package's extra activations.
  const activationsForEvent = (eventKey: string) =>
    activations.filter((m) => {
      const region = (m.region || '').toLowerCase();
      const bothApplies = region === 'both' && eventKey !== 'nyc';
      return region === eventKey || bothApplies;
    });

  // Match a catalogue item (or a picked module) to the synced activation by
  // title. Exact normalised match first, then a title that starts with the
  // wanted one — so "Event App" finds "Event App Sponsor" without "Livestream
  // Sponsor" swallowing "Rollup TV Livestream Sponsor".
  const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const moduleForLabel = (eventKey: string, label: string) => {
    const want = normalizeTitle(label);
    const pool = activationsForEvent(eventKey);
    return (
      pool.find((m) => normalizeTitle(m.title) === want) ??
      pool.find((m) => normalizeTitle(m.title).startsWith(want)) ??
      undefined
    );
  };

  /**
   * The à la carte menu for one city: the priced catalogue, each item resolved
   * to its activation module (so it shows the same card a tier proposal would)
   * and carrying its default price.
   */
  const menuItemsForEvent = (
    eventKey: string
  ): {
    key: string;
    label: string;
    description?: string;
    moduleId: string | null;
    price: number;
    speaking: boolean;
  }[] =>
    catalogFor(eventKey).map((item) => {
      const module = moduleForLabel(eventKey, item.label);
      return {
        key: item.key,
        label: item.label,
        description: module?.description ?? undefined,
        moduleId: module?.id ?? null,
        price: item.price,
        speaking: !!item.speaking,
      };
    });

  /** The effective price of one picked item: the rep's override, or the
   *  catalogue default when they haven't touched it. */
  const menuPriceFor = (eventKey: string, item: { key: string; price: number }) => {
    const raw = menuPrices[menuKey(eventKey, item.key)];
    return raw ?? String(item.price);
  };

  /** The item keys picked for one city, in menu order. */
  const menuPicksForEvent = (eventKey: string) =>
    menuItemsForEvent(eventKey)
      .filter((item) => menuPicks.includes(menuKey(eventKey, item.key)))
      .map((item) => item.key);

  const bothEvents = event === 'both';
  const scopedEvents = bothEvents ? EVENTS.map((e) => e.key) : event ? [event] : [];

  // À la carte is offered wherever an in-scope event sells it, and chosen per
  // city (menuSel). On a both proposal either city can be item by item while
  // the other is a tier, or both can be — which is how it's actually sold.
  const menuOfferedEvents = scopedEvents.filter((key) => A_LA_CARTE_EVENTS.includes(key));
  const menuOffered = menuOfferedEvents.length > 0;
  /** The in-scope cities actually being sold à la carte. */
  const menuScope = menuOfferedEvents.filter((key) => menuSel.includes(key));
  const onMenu = menuScope.length > 0;

  /** The GA/VIP pass counts set for one city, as save-ready lines. */
  const ticketLinesForEvent = (eventKey: string): MenuLine[] =>
    TICKET_ITEMS.flatMap((ticket) => {
      const raw = menuTickets[menuKey(eventKey, ticket.key)];
      const qty = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isFinite(qty) || qty <= 0) return [];
      return [{ key: ticket.key, label: ticket.label, event: eventKey, moduleId: null, price: null, qty }];
    });

  /** An à la carte city's lines, ready to save: the rep's package price, the
   *  branding activations (each priced, adding on), the speaking sessions and
   *  passes (listed, no charge). */
  const menuLines: MenuLine[] = menuScope.flatMap((eventKey) => {
    const lines: MenuLine[] = [];
    // The one bundle price for the custom package.
    const pkg = packagePrice[eventKey];
    if (pkg && parsePrice(pkg) !== null) {
      lines.push({ key: 'ala-package', label: 'À la carte package', event: eventKey, moduleId: null, price: pkg });
    }
    // Priced add-ons: activations and speaking sessions.
    menuItemsForEvent(eventKey)
      .filter((item) => menuPicks.includes(menuKey(eventKey, item.key)))
      .forEach((item) => {
        lines.push({
          key: item.key,
          label: item.label,
          event: eventKey,
          moduleId: item.moduleId,
          price: menuPriceFor(eventKey, item) || null,
        });
      });
    // Bundled inclusions, listed with no price: added benefits, then passes.
    // GA/VIP benefits are skipped here — they're carried by the pass lines with
    // their count, so they aren't listed twice.
    (overrides[eventKey]?.added ?? [])
      .filter((label) => !/general admission|vip/i.test(label))
      .forEach((label) => {
        lines.push({ key: `benefit:${label}`, label, event: eventKey, moduleId: null, price: null });
      });
    lines.push(...ticketLinesForEvent(eventKey));
    return lines;
  });

  /** The standard price for a tier at one event, from that event's table. */
  const priceFor = (eventKey: string, tier: string) => {
    const table = modules.find(
      (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === eventKey
    );
    return table && tier ? table.pricing[tier.toLowerCase()] ?? null : null;
  };

  // ---- Package extras: a tier includes one activation; any others are charged.
  const tierForEventNow = (eventKey: string) => (bothEvents ? tiersByEvent[eventKey] : sponsorTier);
  /** The activations picked for one city, resolved to their modules. */
  const pickedActivationsForEvent = (eventKey: string): SponsorshipModule[] =>
    cart
      .filter((k) => cartEvent(k) === eventKey)
      .map((k) => byId.get(cartModuleId(k)))
      .filter((m): m is SponsorshipModule => Boolean(m));
  /** Which picked activation the package covers, if the rep has decided.
   *  Undefined means undecided — the sponsor picks from the options. */
  const includedActivationFor = (eventKey: string): string | undefined => {
    const picked = pickedActivationsForEvent(eventKey);
    const marked = includedActivation[eventKey];
    // Unset means undecided (no default) — the rep explicitly picks the
    // included one; everything else stays an option for the sponsor.
    if (marked && marked !== NONE_INCLUDED && picked.some((m) => m.id === marked)) return marked;
    return undefined;
  };
  /** The other activation options on a package city — everything but the one
   *  it includes. These are free choices for the sponsor (the package covers
   *  one), so they carry no charge. Empty for an à la carte city. */
  const otherOfferingsForEvent = (eventKey: string): SponsorshipModule[] => {
    if (onMenuFor(eventKey) || !tierForEventNow(eventKey)) return [];
    const included = includedActivationFor(eventKey);
    return pickedActivationsForEvent(eventKey).filter((m) => m.id !== included);
  };
  // ---- Checkout line helpers. A package's charge is its tier price plus any
  // benefits added on the Add-ons step and extra passes — activations are free
  // options. À la carte charges each item. Charges sum to the grand total.

  /** The tier's standard price as a plain string, for the package-line default. */
  const defaultPackagePrice = (eventKey: string) => {
    const tier = tierForEventNow(eventKey);
    const value = tier ? parsePrice(priceFor(eventKey, tier)) : null;
    return value === null ? '' : String(value);
  };
  /** The package line's effective price: the rep's override, or the tier default. */
  const packageBaseValue = (eventKey: string) =>
    parsePrice(packagePrice[eventKey] ?? defaultPackagePrice(eventKey));

  /** The priced add-ons' total for one à la carte city — the activations and
   *  speaking sessions. Tickets/benefits are bundled, so they carry no price. */
  const menuAddOnsTotal = (eventKey: string) =>
    menuItemsForEvent(eventKey)
      .filter((item) => menuPicks.includes(menuKey(eventKey, item.key)))
      .reduce<number | null>((sum, item) => {
        const value = parsePrice(menuPriceFor(eventKey, item));
        return value === null ? sum : (sum ?? 0) + value;
      }, null);

  /** An à la carte city's total: the rep's one bundle price plus the priced
   *  add-ons (activations and speaking) that add on to it. */
  const menuTotalForEvent = (eventKey: string): number | null => {
    const pkg = parsePrice(packagePrice[eventKey] ?? '');
    const addOns = menuAddOnsTotal(eventKey);
    if (pkg === null && addOns === null) return null;
    return (pkg ?? 0) + (addOns ?? 0);
  };

  /** The charge for one city: the à la carte items' total, or simply the
   *  package price (activations and inclusions are free — a package is one
   *  price). */
  const eventChargeValue = (eventKey: string): number | null => {
    if (onMenuFor(eventKey)) return menuTotalForEvent(eventKey);
    if (!tierForEventNow(eventKey)) return null;
    return packageBaseValue(eventKey);
  };

  /** The summed lines, and the effective (overridable) grand total. */
  const grandTotalValue = scopedEvents.reduce<number | null>((sum, key) => {
    const value = eventChargeValue(key);
    return value === null ? sum : (sum ?? 0) + value;
  }, null);
  const effectiveGrandTotal = parsePrice(grandTotalOverride) ?? grandTotalValue;

  /**
   * Which stage a tier's speaking slot is on at a given event, read off that
   * event's tier table. Only Presenting and Diamond include one.
   *
   * Returns '' when the table has no value at all — which differs from the
   * table saying the tier gets nothing, and means don't filter rather than
   * wrongly claim there's no speaking slot.
   */
  const stageFor = (eventKey: string): '' | 'main' | 'track' => {
    const tier = bothEvents ? tiersByEvent[eventKey] : sponsorTier;
    const table = modules.find(
      (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === eventKey
    );
    if (!table || !tier) return '';
    const row = (table.tier_rows ?? []).find((r) => /fireside|keynote/i.test(r.label));
    const value = row?.values[tier.toLowerCase()]?.trim();
    if (!value || /^[–—-]$/.test(value)) return '';
    return /main stage/i.test(value) ? 'main' : 'track';
  };

  /** Only the events whose chosen tier includes a speaking slot — in practice
   * Presenting and Diamond. Everything else skips the content step.
   *
   * Until a tier is picked the step stays available: the tier can also be set
   * on the last step, which comes after this one, and hiding it on "not yet
   * decided" would take the option away before the rep had made the choice. */
  const tierAt = (eventKey: string) => (bothEvents ? tiersByEvent[eventKey] : sponsorTier);
  // Decided per event, so each city offers content on its own terms:
  //   - the à la carte event (Asia) offers one when a speaking item is picked;
  //   - a tier event offers one when its tier includes a speaking slot
  //     (Presenting or Diamond), or before a tier has been chosen at all.
  // Per event rather than collapsing the whole à la carte case to a single
  // 'both' session — otherwise a both proposal that mixes à la carte in one
  // city with a speaking tier in the other only ever asked once, labelled
  // "both", and the saved session belonged to neither city on the proposal.
  // A speaking benefit added on the Add-ons step earns that event a content
  // proposal too, whichever way the event is sold.
  const addedSpeaking = (key: string) =>
    (overrides[key]?.added ?? []).some((label) => SPEAKING_ROW.test(label));

  const sessionEvents = scopedEvents.filter((key) => {
    if (addedSpeaking(key)) return true;
    if (onMenuFor(key)) return menuPicksForEvent(key).some((pick) => isSpeaking(key, pick));
    return !tierAt(key) || stageFor(key) !== '';
  });
  const contentOffered = sessionEvents.length > 0;

  // Add-ons: per event, the tier table for that city, the benefits its tier
  // already includes (which the rep may drop), and the benefits elsewhere in
  // that chart it doesn't include (which the rep may add on). An à la carte
  // event has no tier chart, so it offers no add-ons.
  const tierTableFor = (eventKey: string) =>
    modules.find(
      (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === eventKey
    );

  const includedRows = (eventKey: string) => {
    const tier = tierAt(eventKey)?.toLowerCase();
    const table = tierTableFor(eventKey);
    if (!tier || !table) return [] as string[];
    return (table.tier_rows ?? [])
      .filter((row) => !TITLE_ROW.test(row.label))
      .filter((row) => !hidesKioskRow(includeKiosk, row.label))
      .filter((row) => {
        const v = row.values[tier]?.trim();
        return v && !NOT_INCLUDED.test(v);
      })
      .map((row) => row.label);
  };

  const addableRows = (eventKey: string) => {
    const table = tierTableFor(eventKey);
    if (!table) return [] as string[];
    // No tier (an à la carte city) means nothing is included by default, so
    // every benefit the chart grants is available to add on — speaking included.
    const already = new Set(includedRows(eventKey));
    return (table.tier_rows ?? [])
      .filter((row) => !TITLE_ROW.test(row.label))
      // Speaking is handled as its own priced opportunity, not an add-on.
      .filter((row) => !SPEAKING_ROW.test(row.label) && !/speaking/i.test(row.label))
      // "Branding & Activation item included" is a tier concept — à la carte
      // picks its activations directly, so it isn't an add-on here.
      .filter((row) => !/branding\s*&?\s*activation/i.test(row.label))
      .filter((row) => !hidesKioskRow(includeKiosk, row.label))
      .filter((row) => !already.has(row.label))
      // Only rows some other tier actually grants — a line that's a dash in
      // every column is a header or a not-offered row, not an add-on.
      .filter((row) =>
        Object.values(row.values).some((v) => {
          const t = v?.trim();
          return t && !NOT_INCLUDED.test(t);
        })
      )
      .map((row) => row.label);
  };

  // Add-ons are for à la carte only now — a package is one price, so it has no
  // chart to tweak. An à la carte city has no tier of its own, but the chart's
  // benefits can still be added on to the basket.
  const isMenuEvent = (key: string) => onMenuFor(key);
  const addOnEvents = scopedEvents.filter(
    (key) => !!tierTableFor(key) && isMenuEvent(key)
  );
  const addOnOffered = addOnEvents.length > 0;
  // Whether the rep has actually changed anything — drives the custom-pricing
  // note below and whether overrides are worth saving.
  const hasOverrides = addOnEvents.some((key) => {
    const ov = overrides[key];
    return (ov?.removed?.length ?? 0) > 0 || (ov?.added?.length ?? 0) > 0;
  });

  // The Add-ons (2) and Content (3) steps can each vanish when the scope
  // changes underneath them; step past one that no longer renders anything
  // rather than stranding the rep on a blank panel.
  useEffect(() => {
    if (step === 2 && !addOnOffered) setStep(contentOffered ? 3 : 4);
  }, [step, addOnOffered, contentOffered]);
  useEffect(() => {
    if (step === 3 && !contentOffered) setStep(4);
  }, [step, contentOffered]);

  /**
   * Loads each event's agenda as soon as a session is wanted there, rather
   * than making the rep press a button for it.
   *
   * Depends ONLY on what should trigger a fetch. Including a loading flag
   * here made the effect re-run the moment it set that flag, and the cleanup
   * then marked its own in-flight request cancelled — the request succeeded
   * and the result was discarded every time.
   */
  const wantedAgendas = sessionEvents.filter((key) => draftFor(key).include).join(',');

  useEffect(() => {
    const keys = wantedAgendas ? wantedAgendas.split(',') : [];
    const missing = keys.filter((key) => !agendas[key]);
    if (!missing.length) return;

    let cancelled = false;
    setAgendaLoading(true);

    Promise.all(
      missing.map(async (key) => {
        const stage = stageFor(key);
        const res = await fetch(`/api/sessions?event=${key}${stage ? `&stage=${stage}` : ''}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Could not load the agenda.');
        return [key, body.sessions] as const;
      })
    )
      .then((pairs) => {
        if (cancelled) return;
        setAgendas((current) => ({ ...current, ...Object.fromEntries(pairs) }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setAgendaLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedAgendas]);

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  /** Scoping to one event decides the proposal's event too — only "Both"
   * leaves it genuinely open, so that's the only case step 3 has to ask. */
  function chooseEventFilter(next: EventFilter) {
    setEventFilter(next);
    // 'both' is a proposal event in its own right now, not only a filter.
    setEvent(next);

    // Drop the chosen tier if the new event doesn't sell it.
    const keys =
      next === 'both' ? EVENTS.flatMap((e) => tiersForEvent(e.key)) : tiersForEvent(next);
    if (keys.length) {
      const available = new Set(keys.map((k) => k.toLowerCase()));
      setSponsorTier((current) => (available.has(current.toLowerCase()) ? current : ''));
    }
  }

  async function generate() {
    setError(null);
    if (!company.trim()) return setError('Company is required.');
    // Autofill has put a rep's own address in here before now.
    if (/@/.test(company)) return setError('Company looks like an email address. Check the field.');
    // Every city sold à la carte needs at least one item (or some passes).
    // Checked per city so a both proposal that's à la carte in one and a tier
    // in the other reports the empty side by name.
    const menuEmpty = menuScope.filter(
      (key) => !menuPicksForEvent(key).length && !ticketLinesForEvent(key).length
    );
    if (menuEmpty.length) {
      const where = bothEvents
        ? ` for ${menuEmpty.map((k) => EVENTS.find((e) => e.key === k)?.label ?? k).join(' and ')}`
        : '';
      return setError(`Pick at least one item${where}.`);
    }
    // Gold is the one tier sold without activations, so it's the one case
    // where an empty proposal is legitimate. Checked per event, so a
    // both-events proposal can be Gold in one city and not the other. À la
    // carte cities are excluded — they carry items, not activations.
    const eventsMissingActivations = scopedEvents.filter(
      (key) => !onMenuFor(key) && !cart.some((k) => cartEvent(k) === key)
    );
    const notGold = eventsMissingActivations.filter(
      (key) => (tierAt(key) || '').toLowerCase() !== 'gold'
    );
    if (notGold.length) {
      const where = bothEvents
        ? ` for ${notGold.map((k) => EVENTS.find((e) => e.key === k)?.label ?? k).join(' and ')}`
        : '';
      return setError(`Add at least one activation${where}. Only Gold can go without.`);
    }
    if (!contactName.trim()) return setError('A contact name is required.');
    // Required, because it's now the key: the proposal page only opens for
    // this address. A blank one would leave the link open to anyone.
    if (!validEmailList(contactEmail)) {
      return setError('A contact email is required. It is the address that unlocks the proposal.');
    }

    setSubmitting(true);
    try {
      const res = await fetch(editing ? `/api/proposals/${existing.slug}` : '/api/proposals', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contactName,
          contactEmail,
          event: event || undefined,
          createdBy,
          createdByName,
          tier: bothEvents ? undefined : sponsorTier || undefined,
          tiers: bothEvents ? tiersByEvent : undefined,
          // The checkout's per-event total (package + extras + benefits +
          // passes) is the authoritative charge for each tier city.
          eventPrices: scopedEvents.reduce<Record<string, string>>((acc, key) => {
            if (onMenuFor(key)) return acc;
            const value = eventChargeValue(key);
            if (value !== null) acc[key] = String(value);
            return acc;
          }, {}),
          // A negotiated grand total the rep typed, overriding the summed lines.
          totalOverride: grandTotalOverride.trim() || undefined,
          aLaCarte: onMenu ? menuLines : undefined,
          logoUrl: logoUrl || undefined,
          introNote: introNote || undefined,
          includeKiosk,
          // Only events still in scope, and only where something was actually
          // changed — so a tier swap that removed an event drops its stale tweaks.
          includedOverrides: hasOverrides
            ? addOnEvents.reduce<Record<string, { removed: string[]; added: string[] }>>(
                (acc, key) => {
                  const ov = overrides[key];
                  if (ov && (ov.removed.length || ov.added.length)) acc[key] = ov;
                  return acc;
                },
                {}
              )
            : undefined,
          contentSessions: sessionEvents
            .map((key) => ({ key, draft: draftFor(key) }))
            .filter(({ draft }) => draft.include && draft.heading.trim())
            .map(({ key, draft }) => ({
              event: key,
              heading: draft.heading.trim(),
              description: draft.description.trim() || undefined,
              title: draft.title.trim() || undefined,
              speakers: draft.speakers,
            })) satisfies ContentSession[],
          // À la carte branding items are ordinary activation modules, so
          // they're linked the same way and render as the same cards on the
          // proposal. Speaking items have no module and are carried by
          // aLaCarte alone. A mixed both proposal keeps both halves: the tier
          // cities' cart picks (dropping any that belong to an à la carte city)
          // and the à la carte cities' branding modules.
          modules: [
            ...cart
              .filter((key) => !onMenuFor(cartEvent(key) ?? ''))
              .map((key) => ({ moduleId: cartModuleId(key), event: cartEvent(key) })),
            ...menuLines
              .filter((line) => line.moduleId)
              .map((line) => ({ moduleId: line.moduleId as string, event: line.event })),
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save proposal.');
      router.push(`/builder/proposal/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <ol className="bx-steps-top">
        {STEPS.map((name, i) => {
          // Add-ons (2) shows only for à la carte; a package is one price.
          if ((i === 2 && !addOnOffered) || (i === 3 && !contentOffered)) return null;
          // Steps are navigable, not locked: changing the scope after picking
          // shouldn't mean starting again. Anything before the current step
          // reads as done.
          const state = i < step ? 'done' : i === step ? 'active' : '';
          return (
            <li key={name}>
              <button type="button" onClick={() => setStep(i)} className={`bx-stepchip ${state}`}>
                <span className="num">
                  {i < step ? (
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 12l5 5L19 6" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                {name}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <StepPanel title="What are you selling?">
          {nycOnly ? (
            <Fieldset label="Event">
              <p className="text-sm text-neutral-300">New York</p>
            </Fieldset>
          ) : (
            <Fieldset label="Event">
              <div className="flex flex-wrap gap-2">
                {[...EVENTS, { key: 'both', label: 'Both' }].map((e) => (
                  <Choice
                    key={e.key}
                    selected={eventFilter === e.key}
                    onClick={() => chooseEventFilter(e.key as EventFilter)}
                  >
                    {e.label}
                  </Choice>
                ))}
              </div>
            </Fieldset>
          )}

          {eventFilter === 'both' ? (
            // Each city is bought separately, so the tier is chosen per city
            // here rather than as a filter.
            EVENTS.map((e) => {
              const options = tiersForEvent(e.key).map(
                (t) => t.charAt(0).toUpperCase() + t.slice(1)
              );
              return (
                <Fieldset key={e.key} label={`${e.label} tier`}>
                  {options.length ? (
                    <div className="flex flex-wrap gap-2">
                      {options.map((t) => (
                        <Choice
                          key={t}
                          selected={tiersByEvent[e.key] === t && !onMenuFor(e.key)}
                          onClick={() => {
                            // Picking a tier takes this city off the à la carte menu.
                            setMenuSel((current) => current.filter((k) => k !== e.key));
                            setTiersByEvent((current) => {
                              const next = { ...current };
                              if (next[e.key] === t) delete next[e.key];
                              else next[e.key] = t;
                              return next;
                            });
                          }}
                        >
                          {t}
                        </Choice>
                      ))}
                      {A_LA_CARTE_EVENTS.includes(e.key) && (
                        <Choice
                          selected={onMenuFor(e.key)}
                          onClick={() => {
                            setMenuSel((current) => [...new Set([...current, e.key])]);
                            // No tier for the city being sold item by item.
                            setTiersByEvent((current) => {
                              const next = { ...current };
                              delete next[e.key];
                              return next;
                            });
                          }}
                        >
                          À la carte
                        </Choice>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No tier pricing has synced for {e.label} yet.
                    </p>
                  )}
                </Fieldset>
              );
            })
          ) : (
            <Fieldset
              label="Selling"
              hint={onMenu ? 'Items are picked next, each priced by hand.' : 'The tier this sponsor is buying.'}
            >
              <div className="flex flex-wrap gap-2">
                {scopeTiers.map((t) => (
                  <Choice
                    key={t}
                    selected={!onMenu && sponsorTier === t}
                    onClick={() => {
                      // Single-select: this IS the tier the sponsor is buying,
                      // chosen here and shown locked on the Sponsor step. Picking
                      // a tier takes the event off the à la carte menu.
                      setMenuSel([]);
                      setSponsorTier(sponsorTier === t ? '' : t);
                    }}
                  >
                    {t}
                  </Choice>
                ))}
                {/* Sits with the tiers because it's the same decision: what
                    this sponsor is buying. Offered wherever the event sells it. */}
                {menuOffered && (
                  <Choice
                    selected={onMenu}
                    onClick={() => {
                      setMenuSel(menuOfferedEvents);
                      setSponsorTier('');
                    }}
                  >
                    À la carte
                  </Choice>
                )}
              </div>
            </Fieldset>
          )}

          <Button className="mt-2" onClick={() => setStep(1)}>
            Continue
          </Button>
        </StepPanel>
      )}

      {step === 1 && (
        <StepPanel
          title={onMenu && !bothEvents ? 'Choose items' : 'Package'}
          hint={`${cart.length + menuPicks.length} selected`}
        >
          {/* One block per city sold à la carte — add items from a dropdown;
              each picked item lists below with its price. */}
          {menuScope.map((eventKey) => {
            const catalog = catalogFor(eventKey);
            const brandingAll = catalog.filter((i) => !i.speaking);
            const speakingAll = catalog.filter((i) => i.speaking);
            const brandingPicked = brandingAll.filter((i) => menuPicks.includes(menuKey(eventKey, i.key)));
            const brandingAddable = brandingAll.filter((i) => !menuPicks.includes(menuKey(eventKey, i.key)));
            return (
              <div key={`menu-${eventKey}`} style={{ marginBottom: 28 }}>
                <div className="bx-subhead">
                  <span className="t dim">
                    {ALL_EVENTS.find((e) => e.key === eventKey)?.label ?? 'À la carte'}
                  </span>
                  <span className="rule" />
                </div>

                <Fieldset label="Activations" hint="Select what's included in this package." stackHint>
                  <select
                    className="w-full max-w-md rounded-none border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleMenuPick(eventKey, e.target.value);
                    }}
                  >
                    <option value="">Add an activation…</option>
                    {brandingAddable.map((i) => (
                      <option key={i.key} value={i.key}>
                        {i.label} ({formatPrice(i.price)})
                      </option>
                    ))}
                  </select>
                  {brandingPicked.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {brandingPicked.map((i) => (
                        <div key={i.key} className="flex items-center gap-3 text-sm">
                          <span className="flex-1 text-neutral-300">{i.label}</span>
                          <span className="text-neutral-500">{formatPrice(i.price)}</span>
                          <button
                            type="button"
                            onClick={() => toggleMenuPick(eventKey, i.key)}
                            className="text-neutral-500 hover:text-neutral-300"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Fieldset>

                {/* Speaking opportunities — listed with their cost. Only events
                    that sell them show this (Asia today, not London). */}
                {speakingAll.length > 0 && (
                  <Fieldset label="Speaking opportunities" hint="Select any to include, each at its cost." stackHint>
                    <div className="space-y-1">
                      {speakingAll.map((i) => {
                        const on = menuPicks.includes(menuKey(eventKey, i.key));
                        return (
                          <label key={i.key} className="flex items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleMenuPick(eventKey, i.key)}
                            />
                            <span className="flex-1 text-neutral-300">{i.label}</span>
                            <span className="text-neutral-500">{formatPrice(i.price)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </Fieldset>
                )}
              </div>
            );
          })}

          {/* Tier cities: pick the included activation from a dropdown, and add
              any undecided options for the sponsor to choose from. Scoped to the
              tier being bought. */}
          {scopedEvents
            .filter((key) => !onMenuFor(key) && tierForEventNow(key))
            .map((key) => {
              // Only this tier's activations — a package's options are scoped to
              // the tier it's buying (à la carte, handled elsewhere, shows all).
              const tierNow = (tierForEventNow(key) || '').toLowerCase();
              const all = activationsForEvent(key).filter(
                (m) => (m.tier || '').toLowerCase() === tierNow
              );
              const included = includedActivationFor(key);
              // Unset or "none" both read as Undecided in the dropdown.
              const includedVal = included ?? NONE_INCLUDED;
              const offerings = pickedActivationsForEvent(key).filter((m) => m.id !== included);
              const addable = all.filter((m) => !cart.includes(cartKey(key, m.id)));
              return (
                <div key={`act-${key}`} style={{ marginBottom: 28 }}>
                  <div className="bx-subhead">
                    <span className="t dim">
                      {bothEvents ? `${ALL_EVENTS.find((e) => e.key === key)?.label ?? key} · ` : ''}
                      {tierForEventNow(key)} package
                    </span>
                    <span className="rule" />
                  </div>

                  {/* What the package includes — read-only; the tier's own
                      benefits, no add-ons at the package stage. */}
                  {includedRows(key).length > 0 && (
                    <div className="mb-4 border border-neutral-800">
                      <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                        Included in {tierForEventNow(key)}
                      </div>
                      <ul className="divide-y divide-neutral-800">
                        {includedRows(key).map((benefit) => (
                          <li
                            key={benefit}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-300"
                          >
                            <span aria-hidden style={{ color: 'var(--bx-nyc, #12B981)' }}>✓</span>
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {all.length === 0 ? (
                    <p className="bx-hint" style={{ marginTop: 0 }}>
                      No activations listed for this tier.
                    </p>
                  ) : (
                    <>
                      <Fieldset
                        label="Included activation"
                        hint="The one that comes with the package. (Leave undecided to let the sponsor choose)"
                        stackHint
                      >
                        <select
                          className="w-full max-w-md rounded-none border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
                          value={includedVal}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id === NONE_INCLUDED || id === '') {
                              setIncludedActivation((c) => ({ ...c, [key]: NONE_INCLUDED }));
                            } else {
                              // Deciding on one means the package is just that
                              // activation — drop any options offered for this city.
                              setIncludedActivation((c) => ({ ...c, [key]: id }));
                              setCart((c) => [
                                ...c.filter((k) => cartEvent(k) !== key),
                                cartKey(key, id),
                              ]);
                            }
                          }}
                        >
                          <option value={NONE_INCLUDED}>Undecided (sponsor selects)</option>
                          {all.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      </Fieldset>

                      {/* Only while undecided — once a specific activation is the
                          included one, there's nothing left to choose from. */}
                      {!included && (
                        <Fieldset
                          label="Options to choose from"
                          hint="Undecided, add options here for the sponsor to select."
                          stackHint
                        >
                          <select
                            className="w-full max-w-md rounded-none border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
                            value=""
                            onChange={(e) => {
                              const id = e.target.value;
                              if (id) setCart((c) => [...new Set([...c, cartKey(key, id)])]);
                            }}
                          >
                            <option value="">Add an option…</option>
                            {addable.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title}
                              </option>
                            ))}
                          </select>
                          {offerings.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {offerings.map((m) => (
                                <div key={m.id} className="flex items-center gap-3 text-sm">
                                  <span className="flex-1 text-neutral-300">{m.title}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCart((c) => c.filter((k) => k !== cartKey(key, m.id)))
                                    }
                                    className="text-neutral-500 hover:text-neutral-300"
                                    aria-label="Remove"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </Fieldset>
                      )}
                    </>
                  )}
                </div>
              );
            })}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(addOnOffered ? 2 : contentOffered ? 3 : 4)}>
              {addOnOffered ? 'Add-ons' : contentOffered ? 'Content proposal' : 'Sponsor details'}
            </Button>
          </div>
        </StepPanel>
      )}

      {step === 2 && addOnOffered && (
        <StepPanel title="Add-ons" hint="Optional extras for the à la carte basket">
          <p className="mb-6 text-sm text-neutral-400">
            Open Add on for any extras from the chart to include alongside the à la
            carte items.
          </p>
          {addOnEvents.map((key) => {
            const tier = tierAt(key);
            const ov = overrides[key] ?? { removed: [], added: [] };
            const removed = new Set(ov.removed);
            const added = new Set(ov.added);
            const included = includedRows(key);
            const addable = addableRows(key);

            return (
              <div key={key} className="mb-8 border-b border-neutral-800 pb-6 last:border-0">
                {bothEvents && (
                  <div className="mb-3 text-lg font-bold lowercase tracking-[0.35em] text-neutral-300">
                    {key === 'nyc' ? 'new york' : key}
                  </div>
                )}

                {isMenuEvent(key) ? (
                  <p className="mb-3 text-sm text-neutral-500">
                    À la carte package, add optional extras from the chart below.
                  </p>
                ) : (
                  <Fieldset label={`Included in ${tier}`} hint="Remove anything not in this package.">
                    {included.length === 0 ? (
                      <p className="text-sm text-neutral-500">Nothing listed for this tier.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {included.map((benefit) => {
                          const off = removed.has(benefit);
                          return (
                            <li key={benefit}>
                              <button
                                type="button"
                                onClick={() => toggleOverride(key, 'removed', benefit)}
                                className={`flex w-full items-center gap-3 border px-3 py-2 text-left text-sm ${
                                  off
                                    ? 'border-neutral-800 text-neutral-600 line-through'
                                    : 'border-neutral-700 text-neutral-200'
                                }`}
                              >
                                <span aria-hidden>{off ? '+' : '✓'}</span>
                                <span className="flex-1">{benefit}</span>
                                <span className="text-xs text-neutral-500">
                                  {off ? 'Add back' : 'Remove'}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Fieldset>
                )}

                {addable.length > 0 && (
                  <details className="border border-neutral-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                      <span>Add on</span>
                      <span className="text-neutral-600">
                        {added.size ? `${added.size} added` : `${addable.length} available`}
                      </span>
                    </summary>
                    <ul className="space-y-1.5 border-t border-neutral-800 p-3">
                      {addable.map((benefit) => {
                        const on = added.has(benefit);
                        // GA/VIP rows take a ticket count once added.
                        const ticketKey = /general admission/i.test(benefit)
                          ? 'ga-tickets'
                          : /vip/i.test(benefit)
                          ? 'vip-tickets'
                          : null;
                        return (
                          <li key={benefit}>
                            <button
                              type="button"
                              onClick={() => {
                                // Removing a ticket row clears its count too.
                                if (ticketKey && on) {
                                  setMenuTickets((c) => ({ ...c, [menuKey(key, ticketKey)]: '' }));
                                }
                                toggleOverride(key, 'added', benefit);
                              }}
                              className={`flex w-full items-center gap-3 border px-3 py-2 text-left text-sm ${
                                on
                                  ? 'border-neutral-500 bg-neutral-800 text-neutral-100'
                                  : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                              }`}
                            >
                              <span aria-hidden>{on ? '✓' : '+'}</span>
                              <span className="flex-1">{benefit}</span>
                              <span className="text-xs text-neutral-500">{on ? 'Added' : 'Add'}</span>
                            </button>
                            {on && ticketKey && (
                              <div className="mt-1 flex items-center gap-3 px-3">
                                <span className="text-sm text-neutral-400">How many?</span>
                                <Input
                                  value={menuTickets[menuKey(key, ticketKey)] ?? ''}
                                  onChange={(e) =>
                                    setMenuTickets((c) => ({
                                      ...c,
                                      [menuKey(key, ticketKey)]: e.target.value,
                                    }))
                                  }
                                  placeholder="0"
                                  inputMode="numeric"
                                  className="w-24"
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(contentOffered ? 3 : 4)}>
              {contentOffered ? 'Content proposal' : 'Sponsor details'}
            </Button>
          </div>
        </StepPanel>
      )}

      {step === 3 && contentOffered && (
        <StepPanel title="Content proposal" hint="Optional">
          {sessionEvents.map((key) => {
            const label = ALL_EVENTS.find((e) => e.key === key)?.label ?? key;
            const draft = draftFor(key);
            const stage = stageFor(key);
            const agenda = agendas[key];

            return (
              <div key={key} className="mb-8 border-b border-neutral-800 pb-6 last:border-0">
                <Fieldset
                  label={
                    bothEvents
                      ? `${label}: would you like to add content details to this proposal?`
                      : 'Would you like to add content details to this proposal?'
                  }
                >
                  <div className="flex gap-2">
                    <Choice
                      selected={!draft.include}
                      onClick={() => setDraft(key, { include: false })}
                    >
                      No
                    </Choice>
                    <Choice
                      selected={draft.include}
                      onClick={() => setDraft(key, { include: true })}
                    >
                      Yes
                    </Choice>
                  </div>
                </Fieldset>

                {draft.include && (
                  <>
                    <Fieldset label="Headline" hint="Your framing of the session.">
                      <Input
                        value={draft.heading}
                        onChange={(e) => setDraft(key, { heading: e.target.value })}
                        placeholder="Main Stage Fireside with Uniswap & Key Institutional Partner"
                      />
                    </Fieldset>

                    <Fieldset label="Details" hint="What Blockworks will build with them.">
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft(key, { description: e.target.value })}
                        rows={3}
                        placeholder="Blockworks will work with Uniswap to build a bespoke content proposal which features Uniswap alongside a tier-1 institutional partner. Initial proposal below:"
                        className="bx-textarea"
                      />
                    </Fieldset>

                    <Fieldset
                      label="Session title"
                      hint={
                        agendaLoading && !agenda
                          ? 'Loading the agenda…'
                          : key === 'nyc' && !agenda?.length
                          ? 'Pending DAS NYC 2027 Agenda'
                          : stage === 'main'
                          ? 'Main Stage sessions'
                          : stage === 'track'
                          ? 'Track sessions'
                          : `Optional. From the ${label} agenda in Airtable.`
                      }
                    >
                      <select
                        value={draft.sessionId}
                        disabled={!agenda?.length}
                        onChange={(e) => {
                          const picked = agenda?.find((s) => s.id === e.target.value);
                          setDraft(key, {
                            sessionId: e.target.value,
                            title: picked?.title ?? '',
                            speakers: picked?.speakers ?? [],
                          });
                        }}
                        className="bx-select"
                      >
                        <option value="">
                          {agendaLoading && !agenda
                            ? 'Loading…'
                            : agenda?.length
                            ? 'No session yet'
                            : key === 'nyc'
                            ? 'Pending DAS NYC 2027 Agenda'
                            : 'No sessions available'}
                        </option>
                        {agenda?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                            {s.speakers.length
                              ? ` · ${s.speakers.map((sp) => sp.name).join(', ')}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </Fieldset>

                    {draft.speakers.length > 0 && (
                      <Fieldset label="Speakers">
                        <div className="space-y-2">
                          {draft.speakers.map((sp, i) => (
                            <div
                              key={`${sp.name}-${i}`}
                              className="flex items-center gap-3 border border-neutral-800 p-2"
                            >
                              {sp.photo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={sp.photo} alt="" className="h-10 w-10 shrink-0 object-cover" />
                              )}
                              <div className="flex-1">
                                <div className="text-sm text-neutral-100">{sp.name}</div>
                                <div className="text-xs text-neutral-500">{speakerRole(sp)}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft(key, {
                                    speakers: draft.speakers.filter((_, n) => n !== i),
                                  })
                                }
                                className="text-neutral-500 hover:text-neutral-200"
                                aria-label="Remove speaker"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </Fieldset>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(addOnOffered ? 2 : 1)}>Back</Button>
            <Button onClick={() => setStep(4)}>Sponsor details</Button>
          </div>
        </StepPanel>
      )}

      {step === 4 && (
        <StepPanel title="Sponsor details" hint={`${cart.length} activation${cart.length === 1 ? '' : 's'} selected`}>
          <div className="bx-sponsor-grid">
            <div>
              <Fieldset
                label="Company"
                required
                hint={accounts.length ? 'Pick an existing sponsor, or type a new one.' : undefined}
              >
                <AccountPicker
                  accounts={accounts}
                  value={company}
                  onPick={applyAccount}
                  onChange={(name) => {
                    setCompany(name);
                    // Typing over a company that came from an account drops
                    // that account's details: a new company with the old
                    // sponsor's contact still filled in is worse than blank.
                    if (appliedAccount) {
                      setAppliedAccount(null);
                      setContactName('');
                      setContactEmail('');
                      setLogoUrl('');
                    }
                  }}
                />
              </Fieldset>
              <Fieldset label="Contact name" required>
                <Input
                  name="sponsor-contact-name"
                  autoComplete="off"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </Fieldset>
              <Fieldset
                label="Contact email"
                hint="The proposal opens only for the addresses here. Separate more than one with a semicolon."
                required
              >
                <Input
                  name="sponsor-contact-email"
                  type="email"
                  autoComplete="off"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </Fieldset>
              <Fieldset label="Sponsor logo">
                {logoUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="h-10 w-auto max-w-[120px] bg-white object-contain p-1" />
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-sm text-neutral-400 underline hover:text-neutral-200"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    disabled={logoUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLogoUploading(true);
                      setError(null);
                      try {
                        const data = new FormData();
                        data.append('file', file);
                        const res = await fetch('/api/logo', { method: 'POST', body: data });
                        const body = await res.json();
                        if (!res.ok) throw new Error(body.error ?? 'Logo upload failed.');
                        setLogoUrl(body.url);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setLogoUploading(false);
                      }
                    }}
                    className="w-full text-sm text-neutral-400 file:mr-3 file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
                  />
                )}
              </Fieldset>
              <Fieldset label="Your name" hint="Pick from the team, or type a new one.">
                {/* The same picker as Company: a list to choose from, still
                    an input so someone new isn't blocked. */}
                <AccountPicker
                  accounts={SELLERS.map((seller) => ({
                    id: seller.id,
                    name: seller.name,
                    contactEmail: seller.email,
                  }))}
                  name="rep-name"
                  placeholder="e.g. Alex Barry"
                  value={createdByName}
                  onPick={(seller) => {
                    setCreatedByName(seller.name);
                    if (seller.contactEmail) setCreatedBy(seller.contactEmail);
                  }}
                  onChange={setCreatedByName}
                />
              </Fieldset>
              <Fieldset label="Your email">
                <Input
                  name="rep-email"
                  type="email"
                  autoComplete="off"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                />
              </Fieldset>
            </div>

            <div className="bx-dealcol">
              {/* Never re-asked: the scope in step 1 decided it. */}
              <Fieldset label="Event">
                <p className="text-sm text-neutral-300">
                  {bothEvents
                    ? 'London and Asia'
                    : ALL_EVENTS.find((e) => e.key === event)?.label ?? '—'}
                  {!nycOnly && (
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="ml-2 text-xs text-neutral-500 underline hover:text-neutral-300"
                    >
                      change
                    </button>
                  )}
                </p>
              </Fieldset>

              {/* What each city is buying — chosen in the earlier steps and
                  priced in the checkout popup. */}
              {scopedEvents.map((key) => (
                <Fieldset
                  key={`sel-${key}`}
                  label={bothEvents ? (ALL_EVENTS.find((e) => e.key === key)?.label ?? key) : 'Selling'}
                >
                  {onMenuFor(key) ? (
                    <p className="text-sm text-neutral-300">
                      À la carte · {menuPicksForEvent(key).length} item
                      {menuPicksForEvent(key).length === 1 ? '' : 's'}
                      <button
                        type="button"
                        onClick={() => setStep(0)}
                        className="ml-2 text-xs text-neutral-500 underline hover:text-neutral-300"
                      >
                        change
                      </button>
                    </p>
                  ) : tierForEventNow(key) ? (
                    <p className="text-sm text-neutral-300">
                      {tierForEventNow(key)}
                      <button
                        type="button"
                        onClick={() => setStep(0)}
                        className="ml-2 text-xs text-neutral-500 underline hover:text-neutral-300"
                      >
                        change
                      </button>
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      {!event ? 'Pick an event first.' : 'Not set — choose a tier or à la carte in step 1.'}
                    </p>
                  )}
                </Fieldset>
              ))}

              {/* Asia's tiers have no kiosk, so the question only makes
                  sense when London is in scope. */}
              {(event === 'london' || event === 'both') && (
                <Fieldset
                  label="Kiosk"
                  hint="Included in London tiers. Off leaves it off the proposal."
                >
                  <div className="flex gap-2">
                    <Choice selected={includeKiosk} onClick={() => setIncludeKiosk(true)}>
                      Yes
                    </Choice>
                    <Choice selected={!includeKiosk} onClick={() => setIncludeKiosk(false)}>
                      No
                    </Choice>
                  </div>
                </Fieldset>
              )}

              <Fieldset label="Note to the sponsor">
                <textarea
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  rows={3}
                  placeholder="Add additional notes here. Shows up in the tier box on the proposal."
                  className="bx-textarea"
                />
              </Fieldset>

              {/* Pricing comes last — everything's selected, now price it in the
                  checkout popup. */}
              <Fieldset label="Pricing" hint="Set every line and the total in the checkout.">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => setShowCheckout(true)}>
                    Review &amp; checkout
                  </Button>
                  {effectiveGrandTotal !== null && (
                    <span className="text-sm text-neutral-400">
                      Total{' '}
                      <span className="font-semibold text-neutral-100">
                        {formatPrice(effectiveGrandTotal)}
                      </span>
                    </span>
                  )}
                </div>
              </Fieldset>
            </div>
          </div>

          {cart.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div className="bx-flabel" style={{ marginBottom: 10 }}>In this proposal</div>
              <div className="bx-cart">
                {cart.map((id) => (
                  <span key={id} className="item">
                    {byId.get(cartModuleId(id))?.title ?? id}
                    {bothEvents && cartEvent(id) && (
                      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--bx-faint)' }}>
                        {cartEvent(id)}
                      </span>
                    )}
                    <button type="button" onClick={() => toggle(cart, id, setCart)} aria-label="Remove">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <p className="bx-err">{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(contentOffered ? 3 : addOnOffered ? 2 : 1)}>Back</Button>
            <Button onClick={() => setShowCheckout(true)}>Review &amp; checkout</Button>
          </div>
        </StepPanel>
      )}

      {showCheckout && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
          onClick={() => setShowCheckout(false)}
        >
          <div
            className="my-8 w-full max-w-2xl border border-neutral-800 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-100">Checkout</h3>
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="text-neutral-400 hover:text-neutral-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Toggle: reveal the catalogue originals (and what's bundled), or
                show only what's being offered. */}
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="text-xs text-neutral-400 underline hover:text-neutral-200"
              >
                {showOriginal ? 'Show offer only' : 'Show original prices'}
              </button>
            </div>

            {scopedEvents.map((key) => {
              const isMenu = onMenuFor(key);
              const tier = tierForEventNow(key);
              if (!isMenu && !tier) return null;
              const picked = pickedActivationsForEvent(key);
              const included = includedActivationFor(key);
              const charge = eventChargeValue(key);

              // One charged line: label, the catalogue original (when the toggle
              // is on) and the editable offer price.
              const chargedRow = (
                rowKey: string,
                text: string,
                original: number | null,
                value: string,
                onChange: (v: string) => void
              ) => (
                <div key={rowKey} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-neutral-300">{text}</span>
                  {showOriginal && (
                    <span className="w-24 text-right text-xs text-neutral-500">
                      {original !== null ? formatPrice(original) : '—'}
                    </span>
                  )}
                  <Input
                    // Shown formatted ("$100,000"); only the digits are stored.
                    value={value ? formatPrice(parsePrice(value) ?? 0) : ''}
                    onChange={(ev) => onChange(ev.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    className="w-40"
                  />
                </div>
              );

              return (
                <div key={`co-${key}`} className="mb-5">
                  {bothEvents && (
                    <div className="bx-flabel" style={{ marginBottom: 8 }}>
                      {ALL_EVENTS.find((e) => e.key === key)?.label ?? key}
                    </div>
                  )}

                  {isMenu ? (
                    <div className="space-y-2">
                      {/* One bundle price for the custom package. */}
                      {chargedRow(
                        `ala-${key}`,
                        'À la carte package',
                        null,
                        packagePrice[key] ?? '',
                        (v) => setPackagePrice((c) => ({ ...c, [key]: v }))
                      )}

                      {/* Bundled in, no separate price: added benefits and passes.
                          GA/VIP are shown by the pass rows below, not here. */}
                      {(overrides[key]?.added ?? [])
                        .filter((label) => !/general admission|vip/i.test(label))
                        .map((label) => (
                        <div key={label} className="flex items-center gap-3 text-sm text-neutral-500">
                          <span className="flex-1">{label}</span>
                          <span className="w-40 text-right">In bundle</span>
                        </div>
                      ))}
                      {TICKET_ITEMS.map((t) => {
                        const n = parseInt(menuTickets[menuKey(key, t.key)] ?? '', 10);
                        if (!Number.isFinite(n) || n <= 0) return null;
                        return (
                          <div key={t.key} className="flex items-center gap-3 text-sm text-neutral-500">
                            <span className="flex-1">{t.label}: {n}</span>
                            <span className="w-40 text-right">In bundle</span>
                          </div>
                        );
                      })}

                      {/* Priced add-ons — activations and speaking sessions. */}
                      {menuItemsForEvent(key)
                        .filter((item) => menuPicks.includes(menuKey(key, item.key)))
                        .map((item) =>
                          chargedRow(
                            item.key,
                            item.label,
                            item.price,
                            menuPrices[menuKey(key, item.key)] ?? String(item.price),
                            (v) => setMenuPrices((c) => ({ ...c, [menuKey(key, item.key)]: v }))
                          )
                        )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* The package price — this is the bundle. */}
                      {chargedRow(
                        `pkg-${key}`,
                        `${tier} package`,
                        parsePrice(priceFor(key, tier ?? '')),
                        packagePrice[key] ?? defaultPackagePrice(key),
                        (v) => setPackagePrice((c) => ({ ...c, [key]: v }))
                      )}

                      {/* The activation the package covers — always shown so the
                          bundled choice is visible even in the offer-only view. */}
                      {included && (
                        <div className="flex items-center gap-3 text-sm text-neutral-500">
                          <span className="flex-1">
                            Included: {picked.find((m) => m.id === included)?.title}
                          </span>
                          <span className="w-40 text-right">Bundled</span>
                        </div>
                      )}

                      {/* Other activation options — free choices for the sponsor
                          (the package covers one), so no charge. */}
                      {otherOfferingsForEvent(key).map((m, i) => (
                        <div key={m.id} className="flex items-center gap-3 text-sm text-neutral-500">
                          <span className="flex-1">{m.title} · Option {i + 1}</span>
                          <span className="w-40 text-right">No charge</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {charge !== null && (
                    <div className="mt-2 flex justify-between border-t border-neutral-800 pt-2 text-sm">
                      <span className="text-neutral-400">Subtotal</span>
                      <span className="font-semibold text-neutral-100">{formatPrice(charge)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-4 border-t border-neutral-700 pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-400">Total override</span>
                <Input
                  value={grandTotalOverride ? formatPrice(parsePrice(grandTotalOverride) ?? 0) : ''}
                  onChange={(ev) => setGrandTotalOverride(ev.target.value.replace(/[^\d.]/g, ''))}
                  placeholder={grandTotalValue !== null ? formatPrice(grandTotalValue) : 'Total'}
                  inputMode="decimal"
                  className="w-40"
                />
              </div>
              {effectiveGrandTotal !== null && (
                <div className="mt-3 flex justify-between text-base font-semibold text-white">
                  <span>Grand total</span>
                  <span>{formatPrice(effectiveGrandTotal)}</span>
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="mt-5 flex gap-3">
              <Button variant="secondary" onClick={() => setShowCheckout(false)}>
                Back
              </Button>
              <Button disabled={submitting} onClick={generate}>
                {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create proposal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bx-steppanel">
      <div className="bx-steppanel-head">
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Fieldset({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** Kept for older call sites; the hint always stacks beneath the label now. */
  stackHint?: boolean;
  children: React.ReactNode;
}) {
  // A title with its description as a subtitle underneath — never a long hint
  // running on inline beside the label.
  return (
    <div className="bx-field">
      <div className="bx-flabel" style={{ marginBottom: 2 }}>
        <span>
          {label}
          {/* Marked up front rather than only failing on submit. */}
          {required && <span className="req"> *</span>}
        </span>
      </div>
      {hint && <div className="bx-hint" style={{ marginTop: 0, marginBottom: 8 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`bx-choice${selected ? ' on' : ''}`}>
      {children}
    </button>
  );
}
