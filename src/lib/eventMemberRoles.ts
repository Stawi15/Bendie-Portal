/**
 * The event roles an `event_members` row can hold. Kept in a plain module (no
 * 'use client', no browser client) so server route handlers can validate
 * against the same list the UI offers; `eventTeamProvisioning.ts` re-exports it.
 */
export const EVENT_MEMBER_ROLES = ['host', 'organizer', 'admin', 'facilitator', 'staff', 'attendee', 'speaker'] as const;
export type EventMemberRole = (typeof EVENT_MEMBER_ROLES)[number];
