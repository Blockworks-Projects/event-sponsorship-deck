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
  BRANDING_ITEMS,
  MENU_ITEMS,
  SPEAKING_ITEMS,
  isSpeaking,
  type MenuLine,
} from '@/lib/a-la-carte';
import { hidesKioskRow } from '@/lib/kiosk';

/** Cells that mean "this tier doesn't get it" on the source tier table. */
const NOT_INCLUDED = /^[–—-]$/;

/** The tier-chart row that is a speaking slot. Adding it on earns the event a
 *  content proposal, the same as a Presenting/Diamond tier does. */
const SPEAKING_ROW = /fireside|keynote/i;

// Tiers are stored uppercase on the modules ("PRESENTING") but read better
// capitalised, so every comparison here is case-insensitive. The flat filter
// this replaced compared "Presenting" against "PRESENTING" and so silently
// matched nothing at all.
const TIERS = ['Presenting', 'Diamond', 'Platinum', 'Gold'];
// Chronological: Asia is October, London is November.
const EVENTS = [
  { key: 'asia', label: 'Asia' },
  { key: 'london', label: 'London' },
];

type EventFilter = 'london' | 'asia' | 'both';

const STEPS = ['Scope', 'Activations', 'Add-ons', 'Content', 'Sponsor'];

export function ProposalForm({
  modules,
  existing,
  existingModuleIds,
  signedInAs,
}: {
  modules: SponsorshipModule[];
  /** The signed-in rep, used to prefill their own details. */
  signedInAs?: string;
  /** Present when editing rather than creating. */
  existing?: Proposal;
  existingModuleIds?: string[];
}) {
  const router = useRouter();
  const editing = !!existing;
  // When editing, the picking is already done — open on the details (the last
  // step, Sponsor).
  const [step, setStep] = useState(editing ? 4 : 0);

  // Step 1 — what's being sold. These only narrow what step 2 offers; the
  // proposal's own event and tier are set in step 3.
  const [eventFilter, setEventFilter] = useState<EventFilter>(
    (existing?.event as EventFilter) ?? 'london'
  );
  const [tierFilter, setTierFilter] = useState<string[]>([]);

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
   * Selling a tier, or individual items. À la carte is offered where the
   * event sells it — Asia today — and replaces tiers rather than sitting
   * alongside them: there is no tier to show benefits for.
   */
  const [saleMode, setSaleMode] = useState<'tier' | 'menu'>(
    existing?.a_la_carte?.length ? 'menu' : 'tier'
  );
  const [menuPicks, setMenuPicks] = useState<string[]>(
    (existing?.a_la_carte ?? []).map((line) => line.key)
  );
  const [menuPrices, setMenuPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      (existing?.a_la_carte ?? []).map((line) => [line.key, String(parsePrice(line.price) ?? '')])
    )
  );

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
  const [event, setEvent] = useState<string>(existing?.event ?? 'london');
  const [sponsorTier, setSponsorTier] = useState(existing?.tier ?? '');
  // Both-events proposals buy a tier at each, and they can differ.
  const [tiersByEvent, setTiersByEvent] = useState<Record<string, string>>(existing?.tiers ?? {});
  // Standard pricing is the norm; custom is the exception, so it's the one
  // behind a toggle. Reopening a proposal that was priced custom starts on
  // custom, or the rep would have to set it again to change one number.
  const [pricingMode, setPricingMode] = useState<'standard' | 'custom'>(
    existing?.price_lines?.some((line) => line.discount) ||
      existing?.discount_amount ||
      existing?.discount_percent
      ? 'custom'
      : 'standard'
  );
  /** What's actually being charged per event, keyed by event. */
  const [eventPrices, setEventPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      (existing?.price_lines ?? [])
        .filter((line) => line.net)
        .map((line) => [line.event, String(parsePrice(line.net) ?? '')])
    )
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
      return table ? Object.keys(table.pricing) : [];
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

  /**
   * The activations on offer, bucketed by event and then tier — the way
   * they're sold, so a rep works down a group instead of hunting a flat list.
   * An item marked "Both" shows under each event it applies to.
   */
  const groups = useMemo(() => {
    const sellingItems = saleMode === 'menu';
    const wanted = (eventFilter === 'both' ? EVENTS : EVENTS.filter((e) => e.key === eventFilter))
      // A city sold à la carte picks its items from the menu, not from the
      // tier lists — showing both would offer the same activation twice.
      .filter((e) => !(sellingItems && A_LA_CARTE_EVENTS.includes(e.key)));

    return wanted
      .map((ev) => {
        // Across both cities each has its own tier, so each group shows only
        // that city's tier. On a single event the tier checkboxes act as a
        // filter instead, and an empty selection means show everything.
        const wantedTiers =
          eventFilter === 'both'
            ? [tiersByEvent[ev.key]].filter(Boolean)
            : tierFilter;

        return {
          ...ev,
          tiers: TIERS.map((tier) => ({
            tier,
            items: activations.filter((m) => {
              const region = (m.region || '').toLowerCase();
              if (region !== 'both' && region !== ev.key) return false;
              if ((m.tier || '').toLowerCase() !== tier.toLowerCase()) return false;
              if (wantedTiers.length && !wantedTiers.some((t) => t.toLowerCase() === tier.toLowerCase())) {
                return false;
              }
              return true;
            }),
          })).filter((g) => g.items.length),
        };
      })
      .filter((g) => g.tiers.length);
  }, [activations, eventFilter, tierFilter, tiersByEvent, saleMode]);

  // Tier options and the standard price both come from the selected event's
  // tier table in the content deck, so they track whatever it currently says.
  const tierTable = modules.find(
    (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === event.toLowerCase()
  );
  const availableTiers = tierTable
    ? Object.keys(tierTable.pricing).map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    : [];
  const bothEvents = event === 'both';
  // Offered per event: on a both-events proposal Asia can be sold à la carte
  // while London stays on a tier, which is how it's actually sold.
  const menuEvents = (bothEvents ? EVENTS.map((e) => e.key) : [event]).filter((key) =>
    A_LA_CARTE_EVENTS.includes(key)
  );
  const menuOffered = menuEvents.length > 0;
  const onMenu = menuOffered && saleMode === 'menu';
  /** The event the items belong to — Asia today, whether alone or alongside London. */
  const menuEvent = menuEvents[0] ?? event;

  /**
   * The card behind an à la carte item. Branding items are ordinary
   * activation modules from the deck; speaking items have none.
   */
  const menuModuleFor = (item: { match?: RegExp }) =>
    item.match
      ? modules.find(
          (m) =>
            m.category === 'activation' &&
            item.match!.test(m.title) &&
            ['both', menuEvent].includes((m.region || '').toLowerCase())
        )
      : undefined;

  /** The picked items, with their prices, ready to save. */
  const menuLines: MenuLine[] = menuPicks.map((key) => {
    const item = MENU_ITEMS.find((i) => i.key === key);
    const module = item ? menuModuleFor(item) : undefined;
    return {
      key,
      label: item?.label ?? key,
      event: menuEvent,
      moduleId: module?.id ?? null,
      price: menuPrices[key] || null,
    };
  });

  const scopedEvents = bothEvents ? EVENTS.map((e) => e.key) : event ? [event] : [];

  /** The standard price for a tier at one event, from that event's table. */
  const priceFor = (eventKey: string, tier: string) => {
    const table = modules.find(
      (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === eventKey
    );
    return table && tier ? table.pricing[tier.toLowerCase()] ?? null : null;
  };

  // One line per event being bought, and their sum.
  const priceLines = bothEvents
    ? EVENTS.map((e) => ({ ...e, tier: tiersByEvent[e.key] ?? '', price: priceFor(e.key, tiersByEvent[e.key] ?? '') }))
        .filter((line) => line.tier)
    : [];
  const summed = priceLines.reduce<number | null>((sum, line) => {
    const value = parsePrice(line.price);
    return value === null ? sum : (sum ?? 0) + value;
  }, null);

  const listPrice = bothEvents
    ? summed === null ? null : formatPrice(summed)
    : tierTable && sponsorTier
    ? tierTable.pricing[sponsorTier.toLowerCase()]
    : null;

  /**
   * One line per event being bought — both cities on a multi-event proposal,
   * the single city otherwise — so custom pricing works the same either way.
   */
  const chargeLines = bothEvents
    ? priceLines.map((line) => ({ key: line.key, label: line.label, tier: line.tier, list: line.price }))
    : event && sponsorTier
    ? [{ key: event, label: EVENTS.find((e) => e.key === event)?.label ?? event, tier: sponsorTier, list: listPrice }]
    : [];

  /** What each event is actually being charged, honouring custom pricing. */
  const chargedFor = (line: { key: string; list: string | null }) => {
    if (pricingMode !== 'custom') return parsePrice(line.list);
    const typed = parsePrice(eventPrices[line.key] ?? '');
    return typed ?? parsePrice(line.list);
  };

  /** The à la carte items' total, for the summary and for what's quoted. */
  const menuTotal = onMenu
    ? menuPicks.reduce<number | null>((sum, key) => {
        const value = parsePrice(menuPrices[key] ?? '');
        return value === null ? sum : (sum ?? 0) + value;
      }, null)
    : null;

  const chargedTotal = chargeLines.reduce<number | null>((sum, line) => {
    const value = chargedFor(line);
    return value === null ? sum : (sum ?? 0) + value;
  }, null);

  const listTotalValue = parsePrice(listPrice);
  /** Everything being sold: the tier prices plus the à la carte items. */
  const combinedTotal =
    listTotalValue === null && menuTotal === null
      ? null
      : formatPrice((listTotalValue ?? 0) + (menuTotal ?? 0));
  // Only a genuine reduction is a discount; typing the standard price back in
  // shouldn't put a struck-through line on the sponsor's proposal.
  const discountedPrice =
    pricingMode === 'custom' &&
    chargedTotal !== null &&
    listTotalValue !== null &&
    chargedTotal < listTotalValue
      ? formatPrice(chargedTotal)
      : null;

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
    if (onMenu && key === menuEvent) return menuPicks.some((pick) => isSpeaking(pick));
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

  // Events with a chart to tweak: a tier city once its tier is picked, and the
  // à la carte city too — it has no tier of its own, but the same chart's
  // benefits (speaking included) can still be added on to the package.
  const isMenuEvent = (key: string) => onMenu && key === menuEvent;
  const addOnEvents = scopedEvents.filter(
    (key) => !!tierTableFor(key) && (isMenuEvent(key) || !!tierAt(key))
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

  // Adding on or dropping benefits means the tier's list price no longer
  // matches the package, so pricing switches to custom for the rep to set.
  useEffect(() => {
    if (hasOverrides) setPricingMode('custom');
  }, [hasOverrides]);

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

    // Drop any scoped tier the new event doesn't sell, so the filter can't
    // silently keep excluding everything.
    const keys =
      next === 'both' ? EVENTS.flatMap((e) => tiersForEvent(e.key)) : tiersForEvent(next);
    if (keys.length) {
      const available = new Set(keys.map((k) => k.toLowerCase()));
      setTierFilter((current) => current.filter((t) => available.has(t.toLowerCase())));
      setSponsorTier((current) => (available.has(current.toLowerCase()) ? current : ''));
    }
  }

  /** Likewise a single scoped tier is almost always the tier being quoted. */
  function toggleTierFilter(tier: string) {
    const next = tierFilter.includes(tier)
      ? tierFilter.filter((t) => t !== tier)
      : [...tierFilter, tier];
    setTierFilter(next);
    if (next.length === 1) setSponsorTier(next[0]);
  }

  async function generate() {
    setError(null);
    if (!company.trim()) return setError('Company is required.');
    // Autofill has put a rep's own address in here before now.
    if (/@/.test(company)) return setError('Company looks like an email address. Check the field.');
    // Gold is the one tier sold without activations, so it's the one case
    // where an empty proposal is legitimate. Checked per event, so a
    // both-events proposal can be Gold in one city and not the other.
    if (onMenu && !menuPicks.length) {
      return setError('Pick at least one item.');
    }
    const eventsMissingActivations = onMenu
      ? []
      : scopedEvents.filter(
      (key) => !cart.some((k) => cartEvent(k) === key)
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
          eventPrices: pricingMode === 'custom' ? eventPrices : undefined,
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
          // aLaCarte alone.
          modules: onMenu
            ? menuLines
                .filter((line) => line.moduleId)
                .map((line) => ({ moduleId: line.moduleId as string, event: line.event }))
            : cart.map((key) => ({
                moduleId: cartModuleId(key),
                event: cartEvent(key),
              })),
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
      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((name, i) => (
          <li
            key={name}
            className={
              (i === 2 && !addOnOffered) || (i === 3 && !contentOffered)
                ? 'hidden'
                : undefined
            }
          >
            {/* Steps are navigable, not locked: changing the scope after
                picking shouldn't mean starting again. */}
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`px-4 py-2 text-sm font-medium ${
                i === step ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="mr-2 text-xs opacity-60">{i + 1}</span>
              {name}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <StepPanel title="What are you selling?">
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
                          selected={tiersByEvent[e.key] === t && !(onMenu && e.key === menuEvent)}
                          onClick={() => {
                            if (onMenu && e.key === menuEvent) {
                              setSaleMode('tier');
                              setMenuPicks([]);
                            }
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
                          selected={onMenu && e.key === menuEvent}
                          onClick={() => {
                            setSaleMode('menu');
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
              hint={onMenu ? 'Items are picked next, each priced by hand.' : 'Leave empty to see every tier.'}
            >
              <div className="flex flex-wrap gap-2">
                {scopeTiers.map((t) => (
                  <Choice
                    key={t}
                    selected={!onMenu && tierFilter.includes(t)}
                    onClick={() => {
                      // Coming back from à la carte, the picks and their
                      // prices go with it — they belong to a different way of
                      // selling and would otherwise be saved silently.
                      setSaleMode('tier');
                      setMenuPicks([]);
                      toggleTierFilter(t);
                    }}
                  >
                    {t}
                  </Choice>
                ))}
                {/* Sits with the tiers because it's the same decision: what
                    this sponsor is buying. Asia only for now. */}
                {menuOffered && (
                  <Choice
                    selected={onMenu}
                    onClick={() => {
                      setSaleMode('menu');
                      setTierFilter([]);
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
            Choose activations
          </Button>
        </StepPanel>
      )}

      {step === 1 && (
        <StepPanel
          title={onMenu && !bothEvents ? 'Choose items' : 'Choose activations'}
          hint={`${cart.length + menuPicks.length} selected`}
        >
          {onMenu && (
            <>
          {[
            { heading: 'Branding & Activations', items: BRANDING_ITEMS },
            { heading: 'Speaking', items: SPEAKING_ITEMS },
          ].map((group) => (
            <div key={group.heading} className="mb-10">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-neutral-300">
                {group.heading}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const picked = menuPicks.includes(item.key);
                  // Branding items are the same cards a tier proposal sells,
                  // so they show the deck's own title and description rather
                  // than the shorthand on the à la carte slide.
                  const module = menuModuleFor(item);
                  return (
                    <label
                      key={item.key}
                      className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${
                        picked
                          ? 'border-neutral-500 bg-neutral-800'
                          : 'border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() =>
                          setMenuPicks((current) =>
                            current.includes(item.key)
                              ? current.filter((k) => k !== item.key)
                              : [...current, item.key]
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium text-neutral-100">
                          {module?.title ?? item.label}
                        </span>
                        {module?.description && (
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {module.description.slice(0, 90)}
                            {module.description.length > 90 ? '…' : ''}
                          </span>
                        )}
                        {!module && item.match && (
                          // Named on the slide but not found in the library —
                          // better to say so than to sell a blank card.
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            Not found in the synced deck yet.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
            </>
          )}

          {groups.length === 0 && !onMenu && (
            <p className="mb-6 text-sm text-neutral-500">
              Nothing matches that scope. Widen the event or tiers in step 1.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.key} className="mb-10">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-neutral-300">
                {group.label}
              </h3>
              {group.tiers.map(({ tier, items }) => {
                const ids = items.map((m) => cartKey(group.key, m.id));
                const allIn = ids.every((id) => cart.includes(id));
                return (
                  <div key={tier} className="mb-6">
                    <div className="mb-2 flex items-baseline justify-between">
                      <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                        {tier}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCart(
                            allIn
                              ? cart.filter((id) => !ids.includes(id))
                              : [...new Set([...cart, ...ids])]
                          )
                        }
                        className="text-xs text-neutral-400 underline hover:text-neutral-200"
                      >
                        {allIn ? 'Clear group' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((m) => (
                        <label
                          key={m.id}
                          className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${
                            cart.includes(cartKey(group.key, m.id))
                              ? 'border-neutral-500 bg-neutral-800'
                              : 'border-neutral-800 hover:border-neutral-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={cart.includes(cartKey(group.key, m.id))}
                            onChange={() => toggle(cart, cartKey(group.key, m.id), setCart)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block font-medium text-neutral-100">{m.title}</span>
                            {m.description && (
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {m.description.slice(0, 90)}
                                {m.description.length > 90 ? '…' : ''}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(addOnOffered ? 2 : contentOffered ? 3 : 4)}>
              {addOnOffered ? 'Add-ons' : contentOffered ? 'Content Proposal' : 'Sponsor details'}
            </Button>
          </div>
        </StepPanel>
      )}

      {step === 2 && addOnOffered && (
        <StepPanel title="Add-ons" hint="Tune what's in the package">
          <p className="mb-6 text-sm text-neutral-400">
            Remove anything a tier includes that you&apos;re not offering, and open
            Add on for extras from the chart that aren&apos;t already included. Any
            change here switches the package to custom pricing on the last step.
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
                    À la carte package — add optional extras from the chart below.
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
                        return (
                          <li key={benefit}>
                            <button
                              type="button"
                              onClick={() => toggleOverride(key, 'added', benefit)}
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
              {contentOffered ? 'Content Proposal' : 'Sponsor details'}
            </Button>
          </div>
        </StepPanel>
      )}

      {step === 3 && contentOffered && (
        <StepPanel title="Content Proposal" hint="Optional">
          {sessionEvents.map((key) => {
            const label = EVENTS.find((e) => e.key === key)?.label ?? key;
            const draft = draftFor(key);
            const stage = stageFor(key);
            const agenda = agendas[key];

            return (
              <div key={key} className="mb-8 border-b border-neutral-800 pb-6 last:border-0">
                <Fieldset
                  label={
                    bothEvents
                      ? `Would you like to add ${label} details to this proposal?`
                      : 'Would you like to add details to this proposal?'
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
                        className="w-full resize-y border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                      />
                    </Fieldset>

                    <Fieldset
                      label="Session title"
                      hint={
                        agendaLoading && !agenda
                          ? 'Loading the agenda…'
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
                        className="w-full border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50"
                      >
                        <option value="">
                          {agendaLoading && !agenda
                            ? 'Loading…'
                            : agenda?.length
                            ? 'No session yet'
                            : 'No sessions available'}
                        </option>
                        {agenda?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                            {s.speakers.length
                              ? ` — ${s.speakers.map((sp) => sp.name).join(', ')}`
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
        <StepPanel title="Sponsor details" hint={`${cart.length} activations selected`}>
          <div className="grid gap-x-10 md:grid-cols-2">
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
                hint="The proposal page only opens for this address."
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

            <div>
              {/* Never re-asked: the scope in step 1 decided it. */}
              <Fieldset label="Event">
                <p className="text-sm text-neutral-300">
                  {bothEvents
                    ? 'London and Asia'
                    : EVENTS.find((e) => e.key === event)?.label ?? '—'}
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="ml-2 text-xs text-neutral-500 underline hover:text-neutral-300"
                  >
                    change
                  </button>
                </p>
              </Fieldset>

              {bothEvents ? (
                // A sponsor can buy different tiers at each city, so each gets
                // its own picker, limited to the tiers that city actually sells.
                EVENTS.map((e) => {
                  const options = tiersForEvent(e.key).map(
                    (t) => t.charAt(0).toUpperCase() + t.slice(1)
                  );
                  // Sold item by item, so there is no tier to choose here —
                  // this is where its prices are set instead.
                  if (onMenu && e.key === menuEvent) {
                    return (
                      <Fieldset
                        key={e.key}
                        label={`${e.label} à la carte`}
                        hint="Set the price for each item you picked."
                        stackHint
                      >
                        {menuPicks.length === 0 ? (
                          <p className="text-sm text-neutral-500">
                            No items picked yet. Choose them in step 2.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {MENU_ITEMS.filter((item) => menuPicks.includes(item.key)).map(
                              (item) => (
                                <div key={item.key} className="flex items-center gap-3">
                                  <span className="flex-1 text-sm text-neutral-300">
                                    {item.label}
                                  </span>
                                  <Input
                                    value={menuPrices[item.key] ?? ''}
                                    onChange={(ev) =>
                                      setMenuPrices((current) => ({
                                        ...current,
                                        [item.key]: ev.target.value,
                                      }))
                                    }
                                    placeholder="Price"
                                    inputMode="decimal"
                                    className="w-40"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </Fieldset>
                    );
                  }
                  return (
                    <Fieldset key={e.key} label={`${e.label} tier`}>
                      {options.length ? (
                        <div className="flex flex-wrap gap-2">
                          {options.map((t) => (
                            <Choice
                              key={t}
                              selected={tiersByEvent[e.key] === t}
                              onClick={() =>
                                setTiersByEvent((current) => {
                                  const next = { ...current };
                                  if (next[e.key] === t) delete next[e.key];
                                  else next[e.key] = t;
                                  return next;
                                })
                              }
                            >
                              {t}
                            </Choice>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-500">
                          No tier pricing has synced for {e.label} yet.
                        </p>
                      )}
                    </Fieldset>
                  );
                })
              ) : onMenu ? (
                <Fieldset
                  label="À la carte"
                  hint="Set the price for each item you picked."
                  stackHint
                >
                  {menuPicks.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No items picked yet. Choose them in step 2.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {MENU_ITEMS.filter((item) => menuPicks.includes(item.key)).map((item) => (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className="flex-1 text-sm text-neutral-300">{item.label}</span>
                          <Input
                            value={menuPrices[item.key] ?? ''}
                            onChange={(e) =>
                              setMenuPrices((current) => ({
                                ...current,
                                [item.key]: e.target.value,
                              }))
                            }
                            placeholder="Price"
                            inputMode="decimal"
                            className="w-40"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Fieldset>
              ) : (
                <Fieldset label="Sponsorship tier">
                  {availableTiers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableTiers.map((t) => (
                        <Choice key={t} selected={sponsorTier === t} onClick={() => setSponsorTier(t)}>
                          {t}
                        </Choice>
                      ))}
                    </div>
                  ) : (
                    // An empty control looks broken. Say which of the two
                    // reasons it is, since one is the rep's to fix and one isn't.
                    <p className="text-sm text-neutral-500">
                      {!event
                        ? 'Pick an event first.'
                        : `No tier pricing has synced for ${event} yet. Run Sync from Google Slides.`}
                    </p>
                  )}
                </Fieldset>
              )}

              {chargeLines.length > 0 && (
              <Fieldset label="Pricing">
                {hasOverrides ? (
                  // Add-ons change what the package is, so the tier's list price
                  // no longer fits — pricing is locked to custom with a nudge to
                  // set it below.
                  <p className="text-sm text-neutral-400">
                    Additional items have been added or removed, so this package is
                    priced custom, please set the price for it below.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {(['standard', 'custom'] as const).map((mode) => (
                      <Choice
                        key={mode}
                        selected={pricingMode === mode}
                        // Deliberately no prefill: an empty box lets the
                        // placeholder show the standard price, and a blank field
                        // already means "charge the standard price".
                        onClick={() => setPricingMode(mode)}
                      >
                        {mode === 'standard' ? 'Standard pricing' : 'Custom pricing'}
                      </Choice>
                    ))}
                  </div>
                )}
              </Fieldset>

              )}

              {pricingMode === 'custom' && chargeLines.length > 0 && (
                <Fieldset label="Update the cost">
                  <div className="space-y-2">
                    {chargeLines.map((line) => (
                      <div key={line.key} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-sm text-neutral-400">
                          {line.label} · {line.tier}
                        </span>
                        {/* The standard price as placeholder: it shows what
                            they'd charge if they left it alone, and vanishes
                            the moment they type. Written out in full — the
                            tier tables say "$125K", but a field you're about
                            to type a real figure into should read $125,000. */}
                        <Input
                          value={eventPrices[line.key] ?? ''}
                          onChange={(e) =>
                            setEventPrices((current) => ({ ...current, [line.key]: e.target.value }))
                          }
                          placeholder={
                            parsePrice(line.list) !== null
                              ? formatPrice(parsePrice(line.list) as number)
                              : ''
                          }
                          inputMode="decimal"
                          className="flex-1"
                        />
                      </div>
                    ))}
                  </div>
                </Fieldset>
              )}

              {(listPrice || menuTotal !== null) && (
                <div className="mb-6 bg-neutral-800 px-3 py-2 text-sm">
                  {priceLines.map((line) => (
                    <div key={line.key} className="flex justify-between text-neutral-400">
                      <span>{line.label} · {line.tier}</span>
                      <span>{line.price ?? '—'}</span>
                    </div>
                  ))}
                  {/* One line for the items, so a mixed proposal's total is
                      obviously the sum of a tier and a basket rather than
                      appearing to ignore half of what's being sold. */}
                  {menuTotal !== null && (
                    <div className="flex justify-between text-neutral-400">
                      <span>
                        {EVENTS.find((e) => e.key === menuEvent)?.label ?? menuEvent} · À la carte
                      </span>
                      <span>{formatPrice(menuTotal)}</span>
                    </div>
                  )}
                  <div
                    className={`flex justify-between ${
                      priceLines.length || menuTotal !== null
                        ? 'mt-1 border-t border-neutral-700 pt-1'
                        : ''
                    } text-neutral-400`}
                  >
                    <span>{priceLines.length || menuTotal !== null ? 'Combined' : 'Standard'}</span>
                    <span className={discountedPrice ? 'line-through' : undefined}>
                      {combinedTotal}
                    </span>
                  </div>
                  {discountedPrice && (
                    <div className="mt-1 flex justify-between font-semibold text-white">
                      <span>Custom pricing</span>
                      <span>{discountedPrice}</span>
                    </div>
                  )}
                </div>
              )}


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

              <Fieldset
                label="Note to the sponsor"
                hint="Write in any bonus here. Shown under the tier grid, signed with your name."
                stackHint
              >
                <textarea
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Plus a complimentary branded coffee cart for both days."
                  className="w-full resize-y border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                />
              </Fieldset>
            </div>
          </div>

          {cart.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                In this proposal
              </div>
              <div className="flex flex-wrap gap-2">
                {cart.map((id) => (
                  <span key={id} className="flex items-center gap-2 bg-neutral-800 px-3 py-1 text-sm">
                    {byId.get(cartModuleId(id))?.title ?? id}
                    {bothEvents && cartEvent(id) && (
                      <span className="text-xs uppercase tracking-widest text-neutral-500">
                        {cartEvent(id)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(cart, id, setCart)}
                      className="text-neutral-500 hover:text-neutral-200"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(contentOffered ? 3 : addOnOffered ? 2 : 1)}>Back</Button>
            <Button disabled={submitting} onClick={generate}>
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Generate proposal'}
            </Button>
          </div>
        </StepPanel>
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
    <div className="border border-neutral-800 bg-neutral-900 p-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Fieldset({
  label,
  hint,
  required,
  stackHint,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** Hint on its own line beneath the label, for hints too long to sit beside it. */
  stackHint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className={`mb-2 ${stackHint ? '' : 'flex items-baseline gap-3'}`}>
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          {label}
          {/* Marked up front rather than only failing on submit. */}
          {required && <span className="ml-1 text-neutral-500">*</span>}
        </span>
        {hint && (
          <span className={`text-xs text-neutral-600${stackHint ? ' mt-1 block' : ''}`}>{hint}</span>
        )}
      </div>
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
    <button
      type="button"
      onClick={onClick}
      className={`border px-4 py-2 text-sm font-medium ${
        selected
          ? 'border-neutral-200 bg-neutral-100 text-neutral-900'
          : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      {children}
    </button>
  );
}
