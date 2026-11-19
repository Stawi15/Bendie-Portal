# Feature Specification: Content Moderation

**Feature Branch**: `028-content-moderation` (stacked on 027)

**Created**: 2026-11-19

**Status**: Implemented, reviewed and browser-verified (2026-11-19)

**Input**: Bendie Events update, 2026-11-17, action item 13. Every **Report** and **Block** in the attendee app now creates a row in `content_reports`. The new Terms promise a review **within 24 hours**, but today the Supabase dashboard is the only way to see reports. Users can't read the table, so the Portal must use the service role from a server route. The same update makes the database hide a blocked user's posts, comments and messages from whoever blocked them, organisers and admins included. That affects the Portal's Gallery page, which reads posts with the signed-in user's key.

Decisions (developer, 2026-11-19):
1. On a **profile** report, the admin **picks which of the person's events** to remove them from (none pre-selected). Post and message reports pre-select the content's event.
2. Ask the Bendie team for **`reviewed_by`, `reviewed_at`, `action_note`** on `content_reports`. Build now. The screen shows and writes them once they exist and works without them meanwhile.
3. A reported **message** is shown with its sender and chat, plus **up to 3 messages before and after** it.
4. **Gallery** loads through the service role, so blocks don't hide content from the Portal.

## Live facts (verified 2026-11-19, Bendie, read-only)

- `content_reports(id, reporter_id → profiles ON DELETE CASCADE, content_type ∈ {post, message, profile}, content_id, reason ∈ {spam, harassment, inappropriate, impersonation, other}, details, status ∈ {pending, reviewed, dismissed, actioned} default pending, created_at)`. There's no event column and no reviewer columns. RLS has one INSERT policy only. 4 pending reports exist (2 posts, 2 profiles).
- `posts.is_hidden` and `post_comments.is_hidden` exist. Comments can't be reported directly.
- `messages` has no admin policy (participants only), so deleting needs the service role. `message_reads` cascades. Replies are kept (`reply_to_message_id ON DELETE SET NULL`).
- Restrictive SELECT policies `*_hide_blocked_*` on `posts`, `post_comments` and `messages` apply to anyone who blocked the author.
- Gallery today: members see non-hidden posts (and their own). Only Stawi admins see hidden ones. Only Stawi admins or the author can hide or delete.
- Removing someone from an event isn't a ban: any signed-in user can join an active or published event by its link (Events brief #12).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review reports (Priority: P1)

A Stawi admin opens **Moderation** and sees pending reports, oldest first, each with how long it has been waiting. They open one and see what was reported.

**Acceptance Scenarios**:
1. **Given** pending reports, **When** the page opens, **Then** each shows its type, reason, details, reporter, event (when known) and age, and anything older than 24 hours is flagged.
2. **Given** a post report, **When** opened, **Then** the photo, caption, author, event, hidden state and the post's comments show.
3. **Given** a message report, **When** opened, **Then** the message, sender, chat (group or direct, event) and up to 3 messages before and after show, with the reported one marked.
4. **Given** a profile report, **When** opened, **Then** the person's name, photo, job title, bio and events show.
5. **Given** content that no longer exists, **When** opened, **Then** it says so and still allows Dismiss or Mark reviewed.
6. **Given** no pending reports, **Then** an empty state says nothing is waiting. A "Handled" view lists the others.

### User Story 2 - Act on a report (Priority: P1)

**Acceptance Scenarios**:
1. **Hide post** sets `posts.is_hidden = true`. The report becomes `actioned`.
2. **Hide comment** (on a post report) sets that comment's `is_hidden = true`. The report becomes `actioned`.
3. **Delete message** asks for confirmation, deletes it, and the report becomes `actioned`.
4. **Remove from event(s)** asks for confirmation and removes the person from the chosen events. Their Planner access on those events is switched off (best effort, as on Attendees). The report becomes `actioned`. The confirmation says they could rejoin an open event by its link.
5. **Dismiss** sets `dismissed`. **Mark reviewed** (looked at, no action) sets `reviewed`.
6. Once the reviewer columns exist, every status change records who did it and when, plus an optional note.

### User Story 3 - Gallery isn't affected by blocks (Priority: P2)

**Acceptance Scenarios**:
1. **Given** an organiser who blocked someone in the app, **When** they open the event's Gallery, **Then** that person's photos still show.
2. Who can see hidden posts, and who can hide or delete them, is unchanged.

### Edge Cases

- Several reports about the same item: each is handled separately, and the detail view says how many others exist.
- A Block creates a profile report with details "User blocked this profile.". It's handled like any other.
- Acting on content that was already deleted: the action reports "no longer exists". Dismiss and Mark reviewed still work.

## Requirements *(mandatory)*

- **FR-001**: The Moderation page and its routes MUST be Stawi-admin only (middleware for `/portal/admin/**`, page check, `requirePlatformAdmin` in routes).
- **FR-002**: Reports and their content MUST be read with the service role, so blocks and RLS don't hide anything.
- **FR-003**: Pending first, oldest first; more than 24 hours waiting is flagged. A Handled view shows the rest.
- **FR-004**: The actions are as in US2, and each sets the report status. Destructive actions (delete message, remove from events) MUST confirm first.
- **FR-005**: Message context is limited to 3 messages before and after.
- **FR-006**: Removal also deactivates Planner access on each event, reusing Feature 008's removal logic, and never blocks the removal.
- **FR-007**: Reviewer fields are written and shown only when the columns exist. Their absence MUST NOT break any action.
- **FR-008**: Gallery reads and writes go through event-scoped server routes with the same visibility and permission rules as today, so the author's own block doesn't apply.
- **FR-009**: An admin link to Moderation sits next to "Manage organisations".

### Out of scope

- Any Bendie schema change (the reviewer columns are requested from the backend team).
- Banning, or making events invite-only (Events #12).
- Notifying reporters or reported users.
- Reading or writing `user_blocks`.

## Success Criteria *(mandatory)*

- **SC-001**: A Stawi admin can find and handle a pending report in under a minute, without the Supabase dashboard.
- **SC-002**: All 4 live pending reports open with their content (or a "no longer exists" note).
- **SC-003**: A Gallery viewer who blocked an author still sees that author's posts.
