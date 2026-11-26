'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useEvent } from '@/contexts/EventContext';
import { QuizGamesPanel } from '@/components/portal/photo-games/QuizGamesPanel';
import { PhotoGameEditor } from '@/components/portal/photo-games/PhotoGameEditor';
import {
  PhotoGameActivity,
  PhotoGameLeaderboard,
} from '@/components/portal/photo-games/PhotoGameActivity';

/**
 * Games. Feature 032: tabs for the quiz games (unchanged) and the Interactives
 * photo games (Human Bingo, Connects), their activity and the leaderboard.
 * The open tab is in the address (`?tab=`), so links and reloads keep it.
 */
const TABS = [
  { key: 'quiz', label: 'Quiz games' },
  { key: 'bingo', label: 'Human Bingo' },
  { key: 'connects', label: 'Connects' },
  { key: 'activity', label: 'Activity' },
  { key: 'leaderboard', label: 'Leaderboard' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function GamesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentEvent } = useEvent();
  const requested = searchParams.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'quiz';

  const event = currentEvent?.id === eventId ? currentEvent : null;
  const eventInfo = {
    starts_at: event?.starts_at ?? null,
    ends_at: event?.ends_at ?? null,
    interactivesHidden: (event?.disabled_menu_items ?? []).includes('interactives'),
  };

  const select = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'quiz') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div>
      <div className="mb-4">
        <SectionHeader
          sectionKey="games"
          desc="Quiz games, and the Human Bingo and Connects photo games players play in the app"
        />
      </div>
      <div
        role="tablist"
        aria-label="Games"
        className="flex gap-1 overflow-x-auto border-b border-outline-variant mb-5"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`games-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`games-panel-${t.key}`}
            onClick={() => select(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 text-sm whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`games-panel-${tab}`} aria-labelledby={`games-tab-${tab}`}>
        {tab === 'quiz' && <QuizGamesPanel />}
        {tab === 'bingo' && (
          <PhotoGameEditor
            key="bingo"
            scope={{ kind: 'event', eventId }}
            game="human_bingo"
            event={eventInfo}
          />
        )}
        {tab === 'connects' && (
          <PhotoGameEditor
            key="connects"
            scope={{ kind: 'event', eventId }}
            game="connect"
            event={eventInfo}
          />
        )}
        {tab === 'activity' && <PhotoGameActivity eventId={eventId} />}
        {tab === 'leaderboard' && <PhotoGameLeaderboard eventId={eventId} />}
      </div>
    </div>
  );
}
