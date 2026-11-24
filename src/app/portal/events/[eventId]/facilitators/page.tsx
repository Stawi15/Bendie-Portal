'use client';

import { SpeakersPageV1 } from '@/components/speakers/SpeakersPageV1';

/**
 * Speakers (route stays `facilitators`). Feature 031: a thin switch by layout —
 * the current layout renders SpeakersPageV1 (today's page); the Studio 2.0
 * layout renders SpeakersPageV2 (table + inspector, added in US1).
 */
export default function FacilitatorsPage() {
  return <SpeakersPageV1 />;
}
