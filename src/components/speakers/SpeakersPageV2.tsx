'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { useLatestRequest } from '@/lib/useLatestRequest';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { Avatar } from '@/components/portal/Avatar';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { RightPanel } from '@/components/shell/RightPanel';
import { useNavigationGuard } from '@/components/form/DirtyGuard';
import { SpeakerClaimBadge, SpeakerInspector } from '@/components/entities/SpeakerInspector';
import {
  NO_SPEAKER_FILTERS,
  SPEAKER_CSV_COLUMNS,
  SPEAKER_CSV_SAMPLES,
  SPEAKER_ROLE_LABELS,
  SPEAKER_ROLE_TYPES,
  applySpeakerFilters,
  importSpeakerRow,
  isSpeakerFiltered,
  listSpeakers,
  nextSpeakerDisplayOrder,
  parseSpeakerCsvRow,
  speakerGroups,
  speakerSortValue,
  type Speaker,
  type SpeakerCsvRow,
  type SpeakerFilters,
} from '@/lib/speakers';

/*
 * Feature 031 — Speakers in the Studio 2.0 layout: a table (search, filters,
 * sort) with the speaker inspector beside it. The open speaker is in the
 * address (`?speaker=<id>|new`): Back closes it, reload and links reopen it.
 * Unsaved changes are guarded: every way of moving the open speaker goes
 * through confirmLeave(), and a guarded Back restores the address.
 */

const PARAM = 'speaker';

function TitleOrg({ s }: { s: Speaker }) {
  const text = [s.job_title, s.organization].filter(Boolean).join(' · ');
  return text ? (
    <span className="text-on-surface-variant truncate block">{text}</span>
  ) : (
    <span className="text-on-surface-variant/60">—</span>
  );
}

const COLUMNS: DataTableColumn<Speaker>[] = [
  {
    id: 'name',
    header: 'Name',
    sortValue: (s) => speakerSortValue(s, 'full_name'),
    cell: (s) => (
      <span className="flex items-center gap-3 min-w-0">
        <Avatar name={s.full_name} avatarUrl={s.avatar_url} size={32} />
        <span className="font-medium text-on-surface truncate">{s.full_name || 'Unnamed'}</span>
      </span>
    ),
    className: 'w-[34%]',
  },
  {
    id: 'organization',
    header: 'Title and organisation',
    sortValue: (s) => speakerSortValue(s, 'organization'),
    cell: (s) => <TitleOrg s={s} />,
  },
  {
    id: 'group',
    header: 'Group',
    priority: 'secondary',
    sortValue: (s) => speakerSortValue(s, 'facilitator_group'),
    cell: (s) => (
      <span className="text-on-surface-variant truncate block">{s.facilitator_group || '—'}</span>
    ),
  },
  {
    id: 'role',
    header: 'Role',
    priority: 'secondary',
    cell: (s) => (
      <span className="text-on-surface-variant">
        {SPEAKER_ROLE_LABELS[s.role_type] ?? SPEAKER_ROLE_LABELS.speaker}
      </span>
    ),
  },
  {
    id: 'claim',
    header: 'Profile',
    sortValue: (s) => speakerSortValue(s, 'claim_status'),
    cell: (s) => <SpeakerClaimBadge status={s.claim_status} />,
  },
];

export function SpeakersPageV2() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirmLeave, isDirty } = useNavigationGuard();
  const startRequest = useLatestRequest();

  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<SpeakerFilters>(NO_SPEAKER_FILTERS);
  const [csvOpen, setCsvOpen] = useState(false);

  // ── The open speaker, kept in step with the address ──────────────────────
  const urlSpeaker = searchParams.get(PARAM);
  const [openId, setOpenId] = useState<string | null>(urlSpeaker);
  const openedFromList = useRef(false);
  // True while the deep-link history swap below runs, so its intermediate address is ignored.
  const swappingHistory = useRef(false);

  const hrefFor = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(PARAM, id);
      else params.delete(PARAM);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams]
  );

  // A deep link (page opened with ?speaker=): put the list underneath it, so Back
  // stays on this page (and is guarded) instead of leaving.
  useEffect(() => {
    if (!urlSpeaker) return;
    const current = window.location.pathname + window.location.search + window.location.hash;
    swappingHistory.current = true;
    window.history.replaceState(window.history.state, '', hrefFor(null));
    window.history.pushState(window.history.state, '', current);
    openedFromList.current = true;
    const t = window.setTimeout(() => (swappingHistory.current = false), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // The address changed (Back/Forward, or our own push): move the open speaker,
  // but ask first if there are unsaved changes; "Keep editing" restores the address.
  useEffect(() => {
    if (urlSpeaker === openId || swappingHistory.current) return;
    let cancelled = false;
    (async () => {
      if (isDirty()) {
        const ok = await confirmLeave();
        if (cancelled) return;
        if (!ok) {
          router.push(hrefFor(openId), { scroll: false });
          return;
        }
      }
      setOpenId(urlSpeaker);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the address only
  }, [urlSpeaker]);

  const openSpeaker = async (id: string) => {
    if (id === openId) return;
    if (!(await confirmLeave())) return;
    openedFromList.current = true;
    router.push(hrefFor(id), { scroll: false });
  };

  const closeInspector = async () => {
    if (!(await confirmLeave())) return;
    setOpenId(null);
    if (openedFromList.current) {
      openedFromList.current = false;
      router.back();
    } else {
      router.replace(hrefFor(null), { scroll: false });
    }
  };

  // ── Data ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const signal = startRequest();
    const { data, error } = await listSpeakers(supabase, eventId, signal);
    if (signal.aborted) return;
    if (error) {
      setStatus('error');
      return;
    }
    setSpeakers(data);
    setStatus('ready');
  }, [eventId, startRequest]);

  useEffect(() => {
    if (eventId) void load();
  }, [eventId, load]);

  // An address for a speaker that isn't on this event.
  useEffect(() => {
    if (status !== 'ready' || !openId || openId === 'new') return;
    if (!speakers.some((s) => s.id === openId)) {
      toast.error('That speaker couldn’t be found.');
      openedFromList.current = false;
      setOpenId(null);
      router.replace(hrefFor(null), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, openId, speakers]);

  const shown = useMemo(
    () => applySpeakerFilters(speakers, search, filters),
    [speakers, search, filters]
  );
  const groups = useMemo(() => speakerGroups(speakers), [speakers]);
  const filtered = isSpeakerFiltered(search, filters);
  const resetFilters = () => {
    setSearch('');
    setFilters(NO_SPEAKER_FILTERS);
  };

  const openSpeakerRecord =
    openId && openId !== 'new' ? (speakers.find((s) => s.id === openId) ?? null) : null;
  const inspectorOpen = openId === 'new' || !!openSpeakerRecord;

  const importRow = (row: SpeakerCsvRow) =>
    importSpeakerRow(supabase, eventId, row, nextSpeakerDisplayOrder(speakers) + row.rowIndex);

  const addButton = (
    <button type="button" onClick={() => void openSpeaker('new')} className="btn-primary">
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        add
      </span>{' '}
      Add speaker
    </button>
  );
  const importButton = (
    <button type="button" onClick={() => setCsvOpen(true)} className="btn-secondary">
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        upload_file
      </span>{' '}
      Import spreadsheet
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeader
          sectionKey="facilitators"
          desc={`${speakers.length} ${speakers.length === 1 ? 'speaker' : 'speakers'} for this event`}
        />
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-shrink-0">
          {importButton}
          {addButton}
        </div>
      </div>

      {status === 'loading' ? (
        <DataTable.Loading />
      ) : status === 'error' ? (
        <DataTable.Error
          title="We couldn’t load the speakers."
          onRetry={() => {
            setStatus('loading');
            void load();
          }}
        />
      ) : speakers.length === 0 ? (
        <DataTable.Empty icon="mic" title="No speakers yet">
          <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">
            Add the people presenting at your event. They appear in the attendee app and can be
            assigned to agenda sessions.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {addButton}
            {importButton}
          </div>
        </DataTable.Empty>
      ) : (
        <DataTable.Root
          data={shown}
          columns={COLUMNS}
          getRowId={(s) => s.id}
          onOpenRow={(s) => void openSpeaker(s.id)}
          selectedRowId={openSpeakerRecord?.id ?? null}
          label="Speakers"
          rowLabel={(s) => s.full_name || 'unnamed speaker'}
          renderListItem={(s) => (
            <span className="flex items-center gap-3 min-w-0">
              <Avatar name={s.full_name} avatarUrl={s.avatar_url} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm text-on-surface truncate">
                  {s.full_name || 'Unnamed'}
                </span>
                <span className="block text-xs">
                  <TitleOrg s={s} />
                </span>
              </span>
              <SpeakerClaimBadge status={s.claim_status} />
            </span>
          )}
        >
          <DataTable.Toolbar>
            <DataTable.Search
              value={search}
              onChange={setSearch}
              placeholder="Search name, email, title, organisation…"
              label="Search speakers"
            />
            <DataTable.Filter
              label="Group"
              allLabel="All groups"
              value={filters.group ?? ''}
              onChange={(v) => setFilters((f) => ({ ...f, group: v || null }))}
              options={groups.map((g) => ({ value: g, label: g }))}
            />
            <DataTable.Filter
              label="Role"
              allLabel="All roles"
              value={filters.role ?? ''}
              onChange={(v) => setFilters((f) => ({ ...f, role: v || null }))}
              options={SPEAKER_ROLE_TYPES.map((r) => ({ value: r, label: SPEAKER_ROLE_LABELS[r] }))}
            />
            <label className="flex items-center gap-2 h-control px-2 text-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={filters.unclaimedOnly}
                onChange={(e) => setFilters((f) => ({ ...f, unclaimedOnly: e.target.checked }))}
              />
              Not claimed yet
            </label>
            <DataTable.Reset active={filtered} onReset={resetFilters}>
              Reset filters
            </DataTable.Reset>
          </DataTable.Toolbar>
          {shown.length === 0 ? (
            <DataTable.Empty icon="search" title="No speakers match">
              <button type="button" onClick={resetFilters} className="btn-secondary mt-4">
                Reset filters
              </button>
            </DataTable.Empty>
          ) : (
            <DataTable.Body />
          )}
        </DataTable.Root>
      )}

      <RightPanel.Portal
        open={inspectorOpen}
        title={openId === 'new' ? 'New speaker' : 'Speaker'}
        onClose={() => void closeInspector()}
      >
        {inspectorOpen && (
          <SpeakerInspector
            key={openId ?? 'none'}
            eventId={eventId}
            speaker={openSpeakerRecord}
            nextDisplayOrder={nextSpeakerDisplayOrder(speakers)}
            onCancel={() => void closeInspector()}
            onSaved={(saved, wasNew) => {
              void load();
              if (wasNew && saved) {
                // Show the new speaker (now saved) in place of "new".
                setSpeakers((prev) => [...prev, saved]);
                setOpenId(saved.id);
                router.replace(hrefFor(saved.id), { scroll: false });
              }
            }}
            onDeleted={() => {
              setSpeakers((prev) => prev.filter((s) => s.id !== openId));
              void load();
              void closeInspector();
            }}
          />
        )}
      </RightPanel.Portal>

      <CsvImportModal<SpeakerCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={() => void load()}
        title="Import speakers"
        templateFilename="speakers-template.csv"
        columns={SPEAKER_CSV_COLUMNS}
        sampleRows={SPEAKER_CSV_SAMPLES}
        parseRow={parseSpeakerCsvRow}
        importRow={importRow}
      />
    </div>
  );
}
