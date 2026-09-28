-- Feature 016 (guided event creation) — per-event Portal setup-module preference.
--
-- WHY: user testing asked the Portal to show only the modules an event actually
-- needs. That choice has to be event-scoped, shared by everyone managing the
-- event, editable later, and must never delete data. No existing column fits:
--   * event_products is product ENTITLEMENT/usage (Features 002-004) — overloading
--     it with setup preference would conflate product with module.
--   * events.disabled_menu_items drives the ATTENDEE app's menu — reusing it would
--     change what attendees see, which this preference must never do.
--
-- WHAT: one nullable text[] of EVENT_SECTIONS keys (src/lib/eventModules.ts).
--   NULL  = never configured (every event created before this migration) →
--           the Portal shows every available section, exactly as before.
--   array = the optional modules chosen; core sections are always shown.
-- Display preference ONLY: never consulted for authorization. Product
-- entitlement, event membership, RLS and Planner permissions stay authoritative.
--
-- ACCESS: no new policy. Writes are governed by the existing events UPDATE
-- policies (events_update_host_organizer → host/organizer/admin, and global
-- admins). `events` uses column-level grants (see event_creation_provisioning_
-- foundation), so the new column needs explicit SELECT/UPDATE grants for
-- `authenticated`; `anon` gets none (Portal-only setting).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS portal_setup_modules text[];

COMMENT ON COLUMN public.events.portal_setup_modules IS
  'Feature 016: Portal-only setup preference — optional EVENT_SECTIONS keys chosen for this event. NULL = not configured (show all available sections). Display only; never used for authorization; hiding a module never deletes its data.';

GRANT SELECT (portal_setup_modules), UPDATE (portal_setup_modules) ON public.events TO authenticated;
