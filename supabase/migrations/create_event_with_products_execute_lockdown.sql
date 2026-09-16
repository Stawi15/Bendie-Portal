-- Feature 004 -- lock down create_event_with_products' EXECUTE privilege,
-- mirroring get_event_planner_sync_status()'s already-audited, already-
-- hardened grant shape exactly (Feature 003 R3-F5). PUBLIC's implicit
-- default EXECUTE grant (which includes anon) is revoked; only
-- authenticated may call it. service_role needs no explicit grant (already
-- bypasses everything). The function's own internal authorization checks
-- (see create_event_with_products_function.sql) remain the real boundary
-- for which authenticated caller succeeds.

REVOKE EXECUTE ON FUNCTION public.create_event_with_products(uuid, uuid, text, text, timestamptz, timestamptz, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_event_with_products(uuid, uuid, text, text, timestamptz, timestamptz, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_event_with_products(uuid, uuid, text, text, timestamptz, timestamptz, text[]) TO authenticated;
