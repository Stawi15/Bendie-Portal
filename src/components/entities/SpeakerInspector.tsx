'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { friendlyError } from '@/lib/userFacingError';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Avatar } from '@/components/portal/Avatar';
import { StatusBadge } from '@/components/data/StatusBadge';
import { useDirtyGuard } from '@/components/form/DirtyGuard';
import { resolverFrom } from '@/components/form/resolverFrom';
import {
  EMPTY_SPEAKER_INPUT,
  SPEAKER_ROLE_LABELS,
  SPEAKER_ROLE_TYPES,
  createSpeaker,
  deleteSpeaker,
  listSpeakerSessions,
  speakerToInput,
  updateSpeaker,
  validateSpeaker,
  type Speaker,
  type SpeakerInput,
  type SpeakerSession,
} from '@/lib/speakers';

/*
 * Feature 031 — the Speaker inspector (Studio 2.0 layout). Replaces the edit
 * modal: the same ten fields, rules and messages as the current page (rules live
 * in src/lib/speakers.ts), plus the claim status and the read-only sessions the
 * speaker is on. Rendered inside <RightPanel.Portal>; the page owns opening,
 * closing and the address. Registers its dirty state with the unsaved-changes guard.
 */

const resolver = resolverFrom<SpeakerInput>(validateSpeaker);

export function SpeakerClaimBadge({ status }: { status: string }) {
  return status === 'claimed' ? (
    <StatusBadge.Done
      icon="verified"
      title="This speaker has claimed their profile in the attendee app"
    >
      Profile claimed
    </StatusBadge.Done>
  ) : (
    <StatusBadge.Neutral title="This speaker hasn’t claimed their profile in the attendee app yet">
      Not claimed
    </StatusBadge.Neutral>
  );
}

function SessionsList({ eventId, speakerId }: { eventId: string; speakerId: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; sessions: SpeakerSession[]; timeZone: string | null }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listSpeakerSessions(supabase, eventId, speakerId).then((res) => {
      if (cancelled) return;
      setState(
        res.error
          ? { status: 'error' }
          : { status: 'ready', sessions: res.data, timeZone: res.timeZone }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, speakerId]);

  const when = (s: SpeakerSession, timeZone: string | null) => {
    if (!s.starts_at) return 'No time set';
    const tz = timeZone ?? undefined;
    try {
      const day = new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: tz,
      }).format(new Date(s.starts_at));
      const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      });
      const start = time.format(new Date(s.starts_at));
      return s.ends_at
        ? `${day} · ${start}–${time.format(new Date(s.ends_at))}`
        : `${day} · ${start}`;
    } catch {
      return new Date(s.starts_at).toLocaleString('en-GB');
    }
  };

  return (
    <section aria-labelledby="speaker-sessions-heading" className="mt-6">
      <h3
        id="speaker-sessions-heading"
        className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-2"
      >
        Sessions
      </h3>
      {state.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-ui-md bg-surface-container-low animate-pulse" />
          ))}
        </div>
      ) : state.status === 'error' ? (
        <p className="text-sm text-on-surface-variant">Sessions aren’t available right now.</p>
      ) : state.sessions.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Not on any sessions yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {state.sessions.map((s) => (
            <li key={s.id} className="rounded-ui-md border border-outline-variant px-3 py-2">
              <p className="text-sm font-medium text-on-surface">{s.title || 'Untitled session'}</p>
              <p className="text-xs text-on-surface-variant">{when(s, state.timeZone)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
  wide,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-error mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

export function SpeakerInspector({
  eventId,
  speaker,
  nextDisplayOrder,
  onSaved,
  onDeleted,
  onCancel,
}: {
  eventId: string;
  /** null = adding a new speaker. */
  speaker: Speaker | null;
  /** Display order for a new speaker (end of the list). */
  nextDisplayOrder: number;
  onSaved: (saved: Speaker | null, wasNew: boolean) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const confirm = useConfirm();
  const isNew = speaker === null;
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SpeakerInput>({
    defaultValues: speaker ? speakerToInput(speaker) : EMPTY_SPEAKER_INPUT,
    resolver,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const [deleting, setDeleting] = useState(false);

  useDirtyGuard(isDirty && !isSubmitting);

  const fullName = watch('full_name');
  const avatarUrl = watch('avatar_url');

  const onSubmit = handleSubmit(async (values) => {
    if (isNew) {
      const { data, error } = await createSpeaker(supabase, eventId, values, nextDisplayOrder);
      // On failure everything typed stays in the inspector.
      if (error)
        return void toast.error(
          friendlyError(error, 'We couldn’t add this speaker. Check the fields and try again.')
        );
      toast.success('Speaker added');
      reset(values);
      onSaved(data, true);
    } else {
      const { error } = await updateSpeaker(supabase, speaker.id, values);
      if (error)
        return void toast.error(
          friendlyError(error, 'We couldn’t save this speaker. Check the fields and try again.')
        );
      toast.success('Speaker updated');
      reset(values);
      onSaved(null, false);
    }
  });

  const onDelete = async () => {
    if (!speaker) return;
    const ok = await confirm({
      title: 'Remove speaker?',
      message: `Remove "${speaker.full_name}" from this event's speakers?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const { error } = await deleteSpeaker(supabase, speaker.id);
    setDeleting(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success('Speaker removed');
    reset(speakerToInput(speaker)); // nothing unsaved remains
    onDeleted();
  };

  const fieldProps = (name: keyof SpeakerInput) => ({
    id: `speaker-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `speaker-${name}-error` : undefined,
    className: `input ${errors[name] ? 'border-error' : ''}`,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col min-h-full">
      <div className="flex items-center gap-3 mb-5">
        <Avatar name={fullName || speaker?.full_name} avatarUrl={avatarUrl || null} size={48} />
        <div className="min-w-0">
          <p className="font-semibold text-on-surface break-words">
            {fullName?.trim() || (isNew ? 'New speaker' : 'Unnamed')}
          </p>
          {speaker && <SpeakerClaimBadge status={speaker.claim_status} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id="speaker-full_name"
          label="Full name (required)"
          error={errors.full_name?.message}
          wide
        >
          <input
            {...fieldProps('full_name')}
            {...register('full_name')}
            placeholder="Jane Smith"
            autoComplete="off"
          />
        </Field>
        <Field id="speaker-email" label="Email" error={errors.email?.message} wide>
          <input
            {...fieldProps('email')}
            {...register('email')}
            type="email"
            placeholder="jane@example.com"
            autoComplete="off"
          />
        </Field>
        <Field id="speaker-job_title" label="Job title">
          <input
            {...fieldProps('job_title')}
            {...register('job_title')}
            placeholder="Head of Product"
          />
        </Field>
        <Field id="speaker-organization" label="Organisation">
          <input
            {...fieldProps('organization')}
            {...register('organization')}
            placeholder="TechCorp"
          />
        </Field>
        <Field id="speaker-facilitator_group" label="Speaker group">
          <input
            {...fieldProps('facilitator_group')}
            {...register('facilitator_group')}
            placeholder="Keynote speakers"
          />
        </Field>
        <Field
          id="speaker-role_type"
          label="Role type"
          hint="Decides whether they appear under Speakers or Presenters in the attendee app."
        >
          <select {...fieldProps('role_type')} {...register('role_type')}>
            {SPEAKER_ROLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SPEAKER_ROLE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="speaker-linkedin_url" label="LinkedIn URL" wide>
          <input
            {...fieldProps('linkedin_url')}
            {...register('linkedin_url')}
            type="url"
            placeholder="https://linkedin.com/in/…"
          />
        </Field>
        <Field id="speaker-expertise" label="Expertise" wide>
          <input
            {...fieldProps('expertise')}
            {...register('expertise')}
            placeholder="AI, machine learning"
          />
        </Field>
        <Field id="speaker-bio" label="Bio" wide>
          <textarea
            {...fieldProps('bio')}
            {...register('bio')}
            className={`${fieldProps('bio').className} h-28 resize-y`}
            placeholder="Short biography…"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
          />
        </Field>
        <Field id="speaker-avatar_url" label="Avatar URL" wide>
          <input
            {...fieldProps('avatar_url')}
            {...register('avatar_url')}
            placeholder="https://…"
          />
        </Field>
      </div>

      {speaker && <SessionsList eventId={eventId} speakerId={speaker.id} />}

      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-6 px-4 py-3 bg-surface-container-lowest border-t border-outline-variant flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={isSubmitting || deleting}>
          {isSubmitting ? 'Saving…' : isNew ? 'Add speaker' : 'Save changes'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        {speaker && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSubmitting || deleting}
            className="ml-auto h-control px-3 rounded-ui-md text-sm font-medium text-error hover:bg-error/5"
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </form>
  );
}
