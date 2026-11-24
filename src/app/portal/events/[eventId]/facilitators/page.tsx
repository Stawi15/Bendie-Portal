'use client';

import { useShell } from '@/components/shell/ShellContext';
import { SpeakersPageV1 } from '@/components/speakers/SpeakersPageV1';
import { SpeakersPageV2 } from '@/components/speakers/SpeakersPageV2';

/**
 * Speakers (route stays `facilitators`). Feature 031: a thin switch by layout —
 * the current layout renders SpeakersPageV1 (today's page); the Studio 2.0
 * layout renders SpeakersPageV2 (table + inspector).
 */
export default function FacilitatorsPage() {
  const { shell } = useShell();
  return shell === 'v2' ? <SpeakersPageV2 /> : <SpeakersPageV1 />;
}
