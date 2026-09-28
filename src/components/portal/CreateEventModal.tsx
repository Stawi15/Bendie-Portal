'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isProductActiveForOrg } from '@/lib/eventAuth';
import { EVENTS_SELECT_COLUMNS, type EventRow } from '@/lib/eventColumns';
import { getModule, markProductsConfigured, optionalModuleKeysForProducts, type ModuleProduct } from '@/lib/eventModules';
import { ModulePicker } from '@/components/portal/ModulePicker';
import { useAuth } from '@/contexts/AuthContext';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { ProductKey } from '@/lib/productNavigation';
import toast from 'react-hot-toast';

type Event = EventRow;
type ProductChoice = 'bendie' | 'planner' | 'both';
type StepKey = 'basics' | 'product' | 'modules' | 'ready';

type CreateEventModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated: (event: Event) => void;
  /**
   * Feature 006 (FR-042/FR-044): the product context the modal was opened
   * from. Only ever changes the INITIAL selection when the organization is
   * entitled to both products — the user remains free to change it before
   * submitting, and Feature 004's server-side validation stays authoritative
   * regardless of what this prop suggests.
   */
  initialProduct?: ProductKey;
};

const EMPTY_FORM = { name: '', location: '', starts_at: '', ends_at: '' };

type Draft = {
  form: typeof EMPTY_FORM;
  productChoice: ProductChoice | null;
  modules: string[];
  /** "Skip for now" on the Modules step — create with no module preference (every module shown). */
  modulesSkipped?: boolean;
  step: StepKey;
  savedAt?: number;
};

/** Drafts older than this are treated as abandoned and cleared rather than offered. */
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const STEP_TITLES: Record<StepKey, string> = {
  basics: 'Event basics',
  product: 'Products',
  modules: 'Modules',
  ready: 'Get ready',
};

const PRODUCT_OPTIONS: { key: ProductChoice; label: string; desc: string; icon: string }[] = [
  { key: 'bendie', label: 'Bendie', desc: 'The attendee experience — the event app your guests use.', icon: 'smartphone' },
  { key: 'planner', label: 'Bendie Planner', desc: 'Event operations — participants, travel, logistics and production.', icon: 'event_note' },
  { key: 'both', label: 'Both', desc: 'Attendee experience + event operations, linked as one event.', icon: 'join' },
];

function productsFor(choice: ProductChoice | null): ModuleProduct[] {
  if (choice === 'both') return ['bendie', 'planner'];
  return choice ? [choice] : [];
}

/**
 * Feature 016 — durable, on-device event-creation draft (localStorage).
 *
 * - Scope: one draft per USER per ORGANISATION (key includes both ids), so
 *   switching organisation — or another person signing in on the same browser —
 *   can never surface someone else's draft. No user id → no persistence.
 * - Survives Back/Next, closing the dialog, refresh, closing the browser and
 *   coming back later on the same device. Cross-device recovery would need a
 *   server draft model and is deferred.
 * - Local only: written as the user types, zero network traffic. Deliberately
 *   NOT a server draft: creating any server row before the final "Create event"
 *   would mean half-provisioned events (Feature 004 provisions on create).
 * - Never restored silently: on open the user chooses Continue or Discard.
 * - Cleared on successful creation, on Discard, and after 30 days.
 * Contents are the basics typed so far (name, dates, location, product and
 * module choices) — no attendee or personal data.
 */
const draftKey = (organizationId: string, userId: string) => `bendie.portal.createEventDraft.${userId}.${organizationId}`;

function readDraft(organizationId: string, userId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(organizationId, userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft.savedAt && Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(draftKey(organizationId, userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function writeDraft(organizationId: string, userId: string | null, draft: Draft | null) {
  if (!userId) return;
  try {
    if (draft) localStorage.setItem(draftKey(organizationId, userId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(organizationId, userId));
  } catch {
    // Storage unavailable — the draft still lives in memory for this session.
  }
}

export function CreateEventModal({ open, organizationId, onClose, onCreated, initialProduct }: CreateEventModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [rawStep, setStep] = useState<StepKey>('basics');
  const [modules, setModules] = useState<string[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  // The continued draft's product choice, applied whenever the entitlement check resolves
  // (it may still be in flight when the user clicks "Continue setup").
  const continuedDraftProductRef = useRef<ProductChoice | null>(null);
  const [modulesSkipped, setModulesSkipped] = useState(false);
  const [lastLocalSave, setLastLocalSave] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; ends_at?: string }>({});
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Feature 004: entitlement-driven product selection. Checked fresh every
  // time the modal opens for this organization — never cached across a
  // session, since an entitlement can change between visits. The server
  // (create_event_with_products, and the route calling it) remains the
  // authoritative check regardless of what this state shows; this is UX
  // only (research.md §17).
  const [bendieActive, setBendieActive] = useState<boolean | null>(null);
  const [plannerActive, setPlannerActive] = useState<boolean | null>(null);
  const [productChoice, setProductChoice] = useState<ProductChoice | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    const draft = userId ? readDraft(organizationId, userId) : null;
    setForm(EMPTY_FORM);
    setModules([]);
    setModulesSkipped(false);
    setStep('basics');
    setFieldErrors({});
    setLastLocalSave(draft?.savedAt ?? null);
    // Never restore silently — offer it, and don't write anything until the user decides.
    const offer = draft && (draft.form.name || draft.form.location || draft.modules.length) ? draft : null;
    setPendingDraft(offer);
    setDraftReady(!offer);
    continuedDraftProductRef.current = null;
    // A fresh idempotency key per modal-open, not regenerated on a
    // resubmit-after-error within the same open (research.md §7) — a
    // resubmission of the SAME logical request must reuse it so the
    // server-side idempotency check can recognize a retry rather than a
    // new request.
    setIdempotencyKey(crypto.randomUUID());
    setBendieActive(null);
    setPlannerActive(null);
    setProductChoice(null);

    let cancelled = false;
    Promise.all([isProductActiveForOrg(organizationId, 'bendie'), isProductActiveForOrg(organizationId, 'planner')]).then(
      ([bendie, planner]) => {
        if (cancelled) return;
        setBendieActive(bendie);
        setPlannerActive(planner);
        if (bendie && !planner) setProductChoice('bendie');
        else if (!bendie && planner) setProductChoice('planner');
        // Both active: the Feature 006 hint (a continued draft applies its own choice
        // when the user picks "Continue setup"); otherwise no auto-selection — the user
        // must choose (FR-004). Neither active: productChoice stays null, creation stays disabled.
        else if (bendie && planner) setProductChoice(continuedDraftProductRef.current ?? initialProduct ?? null);
      }
    );

    return () => {
      cancelled = true;
      setDraftReady(false);
    };
  }, [open, organizationId, initialProduct, userId]);

  // Keep the on-device draft in step with every change (local only, no network).
  useEffect(() => {
    if (!open || !organizationId || !draftReady) return;
    const hasContent = Boolean(form.name || form.location || form.starts_at || form.ends_at || modules.length);
    const savedAt = Date.now();
    writeDraft(organizationId, userId, hasContent ? { form, productChoice, modules, modulesSkipped, step: rawStep, savedAt } : null);
    setLastLocalSave(hasContent && userId ? savedAt : null);
  }, [open, organizationId, userId, draftReady, form, productChoice, modules, modulesSkipped, rawStep]);

  // A client-side "does the Planner mapping exist" preflight used to live
  // here (FR-019, research.md §17), reading `organization_planner_links`
  // directly. Removed (review finding, 2026-09-16): that table's only RLS
  // policy is `portal_is_global_admin()`, so the read silently came back
  // empty for every ordinary org owner/admin. The server
  // (`POST /api/events/create` → `create_event_with_products`) is fully
  // authoritative for this check and surfaces `planner_mapping_missing`'s
  // friendly message through the ordinary error-toast path below.

  const bothEntitled = bendieActive === true && plannerActive === true;
  const steps: StepKey[] = useMemo(() => (bothEntitled ? ['basics', 'product', 'modules', 'ready'] : ['basics', 'modules', 'ready']), [bothEntitled]);
  // A restored draft's step may not exist for this org's entitlements (e.g. "product"
  // when only one product is active) — fall back to the first step rather than a phantom one.
  const step: StepKey = steps.includes(rawStep) ? rawStep : 'basics';
  const products = productsFor(productChoice);
  // Selections for products not currently chosen are kept in state (so switching
  // Both → Bendie → Both loses nothing) but never shown or submitted.
  const submittedModules = modules.filter((k) => optionalModuleKeysForProducts(products).includes(k));

  if (!open) return null;

  const setField = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'name' || field === 'ends_at' || field === 'starts_at') setFieldErrors((prev) => ({ ...prev, name: field === 'name' ? undefined : prev.name, ends_at: undefined }));
  };

  const noEntitlement = bendieActive === false && plannerActive === false;
  const canSubmit = !!productChoice && !noEntitlement;
  const currentIndex = Math.max(0, steps.indexOf(step));
  const isDirty = Boolean(form.name || form.location || form.starts_at || form.ends_at || modules.length);

  // Field-level validation (Feature 016 reliability pass): the message sits next to
  // the field, input is never cleared, and it disappears as soon as the field is fixed.
  const validateStep = (key: StepKey): boolean => {
    if (key === 'basics') {
      const errors: { name?: string; ends_at?: string } = {};
      if (!form.name.trim()) errors.name = 'Give your event a name — for example “Annual Leadership Summit”.';
      if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) errors.ends_at = 'The end date is before the start date. Choose the same day or a later one.';
      setFieldErrors(errors);
      if (errors.name || errors.ends_at) return false;
    }
    if (key === 'product' && !productChoice) {
      toast.error('Choose which product this event needs');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep(steps[Math.min(currentIndex + 1, steps.length - 1)]);
  };
  const goBack = () => setStep(steps[Math.max(currentIndex - 1, 0)]);

  // Close keeps the on-device draft ("Save & exit"); only Discard removes it.
  const handleClose = () => onClose();
  const handleDiscard = () => {
    continuedDraftProductRef.current = null;
    // Removes only the local draft — never touches any real event.
    writeDraft(organizationId, userId, null);
    setPendingDraft(null);
    setForm(EMPTY_FORM);
    setModules([]);
    setModulesSkipped(false);
    setStep('basics');
    setFieldErrors({});
    setLastLocalSave(null);
    if (bothEntitled) setProductChoice(initialProduct ?? null);
    setDraftReady(true);
  };
  const handleContinueDraft = () => {
    if (!pendingDraft) return;
    setForm(pendingDraft.form);
    setModules(pendingDraft.modules ?? []);
    setModulesSkipped(Boolean(pendingDraft.modulesSkipped));
    setStep(pendingDraft.step ?? 'basics');
    // Remembered for the entitlement check if it hasn't resolved yet; applied now if it has.
    continuedDraftProductRef.current = pendingDraft.productChoice ?? null;
    if (bothEntitled && pendingDraft.productChoice) setProductChoice(pendingDraft.productChoice);
    setPendingDraft(null);
    setDraftReady(true);
  };
  const handleSkipModules = () => {
    setModulesSkipped(true);
    setStep('ready');
  };

  const handleSave = async () => {
    if (!validateStep('basics')) {
      setStep('basics');
      return;
    }
    if (!canSubmit || !productChoice || !idempotencyKey) return;

    setSaving(true);
    const res = await fetch('/api/events/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey,
        organizationId,
        name: form.name.trim(),
        location: form.location.trim() || null,
        startsAt: form.starts_at || null,
        endsAt: form.ends_at || null,
        products,
        // Skipped → send nothing: the event keeps "no preference" and shows every module.
        ...(modulesSkipped ? {} : { modules: markProductsConfigured(submittedModules, products) }),
      }),
    });
    const result = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || !result.ok) {
      toast.error(result.message || result.error || 'Failed to create event');
      return;
    }

    // The event exists from here on — the draft has done its job.
    writeDraft(organizationId, userId, null);
    setLastLocalSave(null);

    if (result.plannerProvisioningStatus === 'failed') {
      toast.error('Event created, but Bendie Planner setup didn’t complete — you can retry it from the event.');
    } else {
      toast.success('Event created');
    }
    if (result.modulesSaved === false) {
      toast.error('Your module choices couldn’t be saved — every module is shown for now. Use “Manage modules” on the Dashboard.');
    }

    // Corrective fix (2026-09-23, live bug report): the event is already
    // durably created at this point — this read-back only hands the full row
    // to `onCreated`. Retries briefly, and even on failure still closes the
    // modal and tells the user honestly what happened, so a transient
    // read-after-write gap can never look like "it didn't create" and prompt
    // a duplicate.
    let event: Event | null = null;
    for (let attempt = 0; attempt < 3 && !event; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400));
      const { data, error } = await supabase.from('events').select(EVENTS_SELECT_COLUMNS).eq('id', result.eventId).maybeSingle();
      if (error) console.error('CreateEventModal: post-create read-back failed', error);
      if (data) event = data;
    }

    if (event) {
      onCreated(event);
    } else {
      toast.error('Event created, but the list couldn’t refresh automatically — reload the page to see it.');
      onClose();
    }
    setForm(EMPTY_FORM);
    setModules([]);
    setStep('basics');
  };

  const needs = (key: string) => submittedModules.includes(key);
  const hasBendie = products.includes('bendie');
  const hasPlanner = products.includes('planner');
  const prepItems: { label: string; done?: boolean }[] = [
    { label: 'Event dates and venue', done: Boolean(form.starts_at && form.location) },
    ...(hasBendie ? [{ label: 'Attendee list (names and emails)' }, { label: 'Agenda / programme' }] : []),
    ...(hasPlanner ? [{ label: 'Participant list for travel and logistics' }] : []),
    ...(needs('facilitators') ? [{ label: 'Speaker names, bios and photos' }] : []),
    ...(needs('attendee-travel') || needs('planner-logistics') ? [{ label: 'Flight details' }] : []),
    ...(needs('planner-logistics') ? [{ label: 'Accommodation and ground transport details' }] : []),
    ...(needs('planner-production') ? [{ label: 'Run-of-show / session timings' }] : []),
    ...(needs('planner-vendors') ? [{ label: 'Supplier and vendor list' }] : []),
    ...(needs('expo') ? [{ label: 'Exhibitor and sponsor details' }] : []),
    ...(hasBendie ? [{ label: 'Brand colours, logo and a hero image' }] : []),
  ];

  const dateRange = [form.starts_at, form.ends_at].filter(Boolean).join(' → ');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow w-full max-w-3xl max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="create-event-title">
        {/* Header + step indicator */}
        <div className="px-6 pt-6 pb-4 border-b border-outline-variant">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary">New event</p>
              <h2 id="create-event-title" className="font-headline-sm text-headline-sm text-on-surface">
                {step === 'basics' && 'What event would you like to build today?'}
                {step === 'product' && 'Which Bendie products does it need?'}
                {step === 'modules' && 'What do you need for this event?'}
                {step === 'ready' && 'Get ready to build your event'}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-shrink-0 p-1.5 -m-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              aria-label={isDirty ? 'Save draft and close' : 'Close'}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          {!noEntitlement && (
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3" aria-label="Steps">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${
                      i < currentIndex ? 'bg-primary text-white' : i === currentIndex ? 'bg-primary/15 text-primary ring-1 ring-primary' : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                    aria-hidden="true"
                  >
                    {i < currentIndex ? '✓' : i + 1}
                  </span>
                  <span className={i === currentIndex ? 'font-semibold text-on-surface' : 'text-on-surface-variant'} aria-current={i === currentIndex ? 'step' : undefined}>
                    {STEP_TITLES[s]}
                  </span>
                  {i < steps.length - 1 && <span className="w-4 h-px bg-outline-variant" aria-hidden="true" />}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {noEntitlement ? (
            <p className="hint">
              Your organisation doesn’t currently have an active Bendie or Bendie Planner entitlement — contact your
              administrator to create events here.
            </p>
          ) : pendingDraft ? (
            <div className="max-w-lg mx-auto text-center py-6" role="region" aria-label="Unfinished event">
              <span className="material-symbols-outlined text-primary text-[36px]" aria-hidden="true">history</span>
              <h3 className="mt-2 text-lg font-semibold text-on-surface">
                Continue setting up {pendingDraft.form.name ? <>“{pendingDraft.form.name}”</> : 'your unfinished event'}?
              </h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {pendingDraft.savedAt ? <>Last saved on this device: {formatRelativeTime(new Date(pendingDraft.savedAt).toISOString())}. </> : null}
                It hasn&apos;t been created yet.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-5">
                <button type="button" className="btn-primary" onClick={handleContinueDraft}>
                  Continue setup
                </button>
                <button type="button" className="btn-secondary" onClick={handleDiscard}>
                  Discard draft
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 'basics' && (
                <div className="space-y-4 max-w-xl">
                  <p className="text-sm text-on-surface-variant">Start with the essentials — you can change any of this later.</p>
                  <div>
                    <label className="label" htmlFor="ce-name">Event name</label>
                    <input
                      id="ce-name"
                      className={`input ${fieldErrors.name ? 'border-error' : ''}`}
                      value={form.name}
                      onChange={setField('name')}
                      placeholder="e.g. Annual Leadership Summit"
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={fieldErrors.name ? 'ce-name-error' : undefined}
                      autoFocus
                    />
                    {fieldErrors.name && (
                      <p id="ce-name-error" className="text-xs text-error mt-1">
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="ce-start">Start date</label>
                      <input id="ce-start" className="input" type="date" value={form.starts_at} onChange={setField('starts_at')} />
                    </div>
                    <div>
                      <label className="label" htmlFor="ce-end">End date</label>
                      <input
                        id="ce-end"
                        className={`input ${fieldErrors.ends_at ? 'border-error' : ''}`}
                        type="date"
                        value={form.ends_at}
                        onChange={setField('ends_at')}
                        min={form.starts_at || undefined}
                        aria-invalid={!!fieldErrors.ends_at}
                        aria-describedby={fieldErrors.ends_at ? 'ce-end-error' : undefined}
                      />
                      {fieldErrors.ends_at && (
                        <p id="ce-end-error" className="text-xs text-error mt-1">
                          {fieldErrors.ends_at}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="ce-location">Location</label>
                    <input id="ce-location" className="input" value={form.location} onChange={setField('location')} placeholder="e.g. Nairobi" />
                  </div>
                </div>
              )}

              {step === 'product' && (
                <div className="space-y-3">
                  <p className="text-sm text-on-surface-variant">Pick what this event will use. If you choose both, they&apos;re linked automatically — you only enter the event&apos;s details once.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Products">
                    {PRODUCT_OPTIONS.map((opt) => {
                      const selected = productChoice === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setProductChoice(opt.key)}
                          className={`text-left rounded-2xl border-2 p-4 transition ${selected ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/60'}`}
                        >
                          <span className="flex items-center justify-between">
                            <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">{opt.icon}</span>
                            {selected && <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">check_circle</span>}
                          </span>
                          <span className="block mt-2 font-semibold text-on-surface">{opt.label}</span>
                          <span className="block text-xs text-on-surface-variant mt-1">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 'modules' && (
                <div className="space-y-4">
                  <p className="text-sm text-on-surface-variant">
                    Choose what you&apos;ll be managing. Only these appear in your event&apos;s navigation — you can change this anytime from the event Dashboard.
                  </p>
                  {products.length === 0 ? (
                    <p className="hint">Checking which products your organisation can use…</p>
                  ) : (
                    <ModulePicker products={products} selected={modules} onChange={setModules} />
                  )}
                </div>
              )}

              {step === 'ready' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-on-surface-variant mb-3">Useful to have to hand while you set up:</p>
                    <ul className="space-y-2">
                      {prepItems.map((item) => (
                        <li key={item.label} className="flex items-center gap-2 text-sm text-on-surface">
                          <span className={`material-symbols-outlined text-[18px] ${item.done ? 'text-primary' : 'text-on-surface-variant/60'}`} aria-hidden="true">
                            {item.done ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          {item.label}
                          {item.done && <span className="sr-only">(already added)</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-sm font-medium text-on-surface">You don&apos;t need everything now — you can add it later.</p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-low p-4 text-sm space-y-2 self-start">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Your event</p>
                    <p className="font-semibold text-on-surface">{form.name || 'Untitled event'}</p>
                    {(dateRange || form.location) && <p className="text-on-surface-variant">{[dateRange, form.location].filter(Boolean).join(' · ')}</p>}
                    <p className="text-on-surface-variant">
                      <span className="font-medium text-on-surface">Products:</span>{' '}
                      {PRODUCT_OPTIONS.find((o) => o.key === productChoice)?.label ?? '—'}
                    </p>
                    <p className="text-on-surface-variant">
                      <span className="font-medium text-on-surface">Modules:</span>{' '}
                      {modulesSkipped
                        ? 'All modules (you skipped choosing — change this anytime with Manage modules)'
                        : submittedModules.length === 0
                          ? 'Only the essentials'
                          : submittedModules.map((k) => getModule(k)?.label ?? k).join(', ')}
                    </p>
                    <p className="hint pt-1">New events start as Draft — you can publish once it&apos;s ready.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant flex flex-wrap items-center gap-3">
          <button type="button" className="text-sm text-on-surface-variant hover:text-on-surface" onClick={handleClose} disabled={saving}>
            {isDirty && userId ? 'Save & exit' : 'Cancel'}
          </button>
          {/* Truthful status: this is a LOCAL draft, not a server save. */}
          {isDirty && userId && lastLocalSave && !pendingDraft && (
            <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant" role="status">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">devices</span>
              Draft saved on this device — not created yet
            </span>
          )}
          <div className="ml-auto flex gap-3">
            {!noEntitlement && !pendingDraft && step === 'modules' && (
              <button type="button" className="btn-secondary" onClick={handleSkipModules} title="Show every module for now — you can choose later with Manage modules">
                Skip for now
              </button>
            )}
            {currentIndex > 0 && !noEntitlement && !pendingDraft && (
              <button type="button" className="btn-secondary" onClick={goBack} disabled={saving}>
                Back
              </button>
            )}
            {!noEntitlement && !pendingDraft && step !== 'ready' && (
              <button type="button" className="btn-primary" onClick={() => { if (step === 'modules') setModulesSkipped(false); goNext(); }}>
                Continue
              </button>
            )}
            {!noEntitlement && !pendingDraft && step === 'ready' && (
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !canSubmit}>
                {saving ? 'Creating…' : 'Create event'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
