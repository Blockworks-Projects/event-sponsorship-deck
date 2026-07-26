'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { speakerRole, type SponsorshipModule, type ContentSession, type SessionSpeaker, type Proposal } from '@/lib/types';
import { applyDiscount, describeDiscount, parsePrice, formatPrice } from '@/lib/pricing';

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

const STEPS = ['Scope', 'Activations', 'Content', 'Sponsor'];

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
  // When editing, the picking is already done — open on the details.
  const [step, setStep] = useState(editing ? 3 : 0);

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
  // Matches the eventFilter default, so the two can't start out of step.
  const [event, setEvent] = useState<string>(existing?.event ?? 'london');
  const [sponsorTier, setSponsorTier] = useState(existing?.tier ?? '');
  // Both-events proposals buy a tier at each, and they can differ.
  const [tiersByEvent, setTiersByEvent] = useState<Record<string, string>>(existing?.tiers ?? {});
  const [totalOverride, setTotalOverride] = useState(existing?.total_override ?? '');
  const [discountValue, setDiscountValue] = useState(
    String(existing?.discount_percent ?? existing?.discount_amount ?? '')
  );
  const [discountUnit, setDiscountUnit] = useState<'percent' | 'amount'>(
    existing?.discount_amount ? 'amount' : 'percent'
  );

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
    const wanted = eventFilter === 'both' ? EVENTS : EVENTS.filter((e) => e.key === eventFilter);

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
  }, [activations, eventFilter, tierFilter, tiersByEvent]);

  // Tier options and the standard price both come from the selected event's
  // tier table in the content deck, so they track whatever it currently says.
  const tierTable = modules.find(
    (m) => m.category === 'tier-table' && (m.region || '').toLowerCase() === event.toLowerCase()
  );
  const availableTiers = tierTable
    ? Object.keys(tierTable.pricing).map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    : [];
  const bothEvents = event === 'both';
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
  const discount = {
    percent: discountUnit === 'percent' ? Number(discountValue) || null : null,
    amount: discountUnit === 'amount' ? Number(discountValue) || null : null,
  };
  const discountedPrice = applyDiscount(listPrice, discount);

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
  const sessionEvents = scopedEvents.filter(
    (key) => !tierAt(key) || stageFor(key) !== ''
  );
  const contentOffered = sessionEvents.length > 0;

  // Changing the tier while standing on the content step would otherwise
  // leave the rep on a step that no longer renders anything.
  useEffect(() => {
    if (step === 2 && !contentOffered) setStep(3);
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
    if (/@/.test(company)) return setError('Company looks like an email address — check the field.');
    if (!cart.length) return setError('Add at least one activation.');
    // Required, because it's now the key: the proposal page only opens for
    // this address. A blank one would leave the link open to anyone.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
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
          totalOverride: totalOverride || undefined,
          discountPercent: discount.percent ?? undefined,
          discountAmount: discount.amount ?? undefined,
          logoUrl: logoUrl || undefined,
          introNote: introNote || undefined,
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
          modules: cart.map((key) => ({
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
          <li key={name} className={i === 2 && !contentOffered ? 'hidden' : undefined}>
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
        <StepPanel
          title="What are you selling?"
          hint="Narrows what you pick from next. Doesn't limit the proposal itself."
        >
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
          ) : (
            <Fieldset label="Tiers" hint="Leave empty to see every tier.">
              <div className="flex flex-wrap gap-2">
                {scopeTiers.map((t) => (
                  <Choice
                    key={t}
                    selected={tierFilter.includes(t)}
                    onClick={() => toggleTierFilter(t)}
                  >
                    {t}
                  </Choice>
                ))}
              </div>
            </Fieldset>
          )}

          <Button className="mt-2" onClick={() => setStep(1)}>
            Choose activations
          </Button>
        </StepPanel>
      )}

      {step === 1 && (
        <StepPanel title="Choose activations" hint={`${cart.length} selected`}>
          {groups.length === 0 && (
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
            <Button onClick={() => setStep(contentOffered ? 2 : 3)}>
              {contentOffered ? 'Content session' : 'Sponsor details'}
            </Button>
          </div>
        </StepPanel>
      )}

      {step === 2 && contentOffered && (
        <StepPanel
          title="Content session"
          hint="Optional — only if a session has been agreed."
        >
          {sessionEvents.map((key) => {
            const label = EVENTS.find((e) => e.key === key)?.label ?? key;
            const draft = draftFor(key);
            const stage = stageFor(key);
            const agenda = agendas[key];

            return (
              <div key={key} className="mb-8 border-b border-neutral-800 pb-6 last:border-0">
                <Fieldset
                  label={bothEvents ? `${label} content session?` : 'Include a content session?'}
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
                        placeholder="Mainstage Fireside with Uniswap & Key Institutional Partner"
                      />
                    </Fieldset>

                    <Fieldset label="Details" hint="What Blockworks will build with them.">
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft(key, { description: e.target.value })}
                        rows={3}
                        placeholder="Blockworks will work with Uniswap to build a bespoke content session which features Uniswap alongside a tier-1 institutional partner. Initial proposal below:"
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
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Sponsor details</Button>
          </div>
        </StepPanel>
      )}

      {step === 3 && (
        <StepPanel title="Sponsor details" hint={`${cart.length} activations selected`}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <div>
              <Fieldset label="Company">
                <Input
                  name="sponsor-company"
                  autoComplete="off"
                  placeholder="e.g. Uniswap"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </Fieldset>
              <Fieldset label="Contact name">
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
              <Fieldset label="Your name">
                <Input
                  name="rep-name"
                  autoComplete="off"
                  value={createdByName}
                  onChange={(e) => setCreatedByName(e.target.value)}
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

              <Fieldset label="Discount">
                <div className="flex gap-2">
                  <Input
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="leave blank for none"
                    inputMode="decimal"
                    className="flex-1"
                  />
                  <div className="flex overflow-hidden border border-neutral-700">
                    {(['percent', 'amount'] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setDiscountUnit(unit)}
                        className={`px-3 text-sm ${
                          discountUnit === unit
                            ? 'bg-neutral-200 font-semibold text-neutral-900'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {unit === 'percent' ? '%' : '$'}
                      </button>
                    ))}
                  </div>
                </div>
              </Fieldset>

              {listPrice && (
                <div className="mb-6 bg-neutral-800 px-3 py-2 text-sm">
                  {priceLines.map((line) => (
                    <div key={line.key} className="flex justify-between text-neutral-400">
                      <span>{line.label} · {line.tier}</span>
                      <span>{line.price ?? '—'}</span>
                    </div>
                  ))}
                  <div
                    className={`flex justify-between ${
                      priceLines.length ? 'mt-1 border-t border-neutral-700 pt-1' : ''
                    } text-neutral-400`}
                  >
                    <span>{priceLines.length ? 'Combined' : 'Standard'}</span>
                    <span className={discountedPrice || totalOverride ? 'line-through' : undefined}>
                      {listPrice}
                    </span>
                  </div>
                  {discountedPrice && (
                    <div className="mt-1 flex justify-between font-semibold text-white">
                      <span>After {describeDiscount(discount)}</span>
                      <span className={totalOverride ? 'line-through' : undefined}>
                        {discountedPrice}
                      </span>
                    </div>
                  )}
                  {totalOverride && (
                    <div className="mt-1 flex justify-between font-semibold text-white">
                      <span>Quoted</span>
                      <span>{totalOverride}</span>
                    </div>
                  )}
                </div>
              )}

              <Fieldset label="Override the total" hint="Optional. For a bundled deal.">
                <Input
                  value={totalOverride}
                  onChange={(e) => setTotalOverride(e.target.value)}
                  placeholder="e.g. $200,000"
                />
              </Fieldset>

              <Fieldset label="Note to the sponsor">
                <textarea
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  rows={3}
                  placeholder="optional, shown under the pricing"
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
            <Button variant="secondary" onClick={() => setStep(contentOffered ? 2 : 1)}>Back</Button>
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          {label}
        </span>
        {hint && <span className="text-xs text-neutral-600">{hint}</span>}
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
