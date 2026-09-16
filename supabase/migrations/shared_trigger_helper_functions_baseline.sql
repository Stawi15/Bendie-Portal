-- Organization & Event Access Foundation (Feature 003) -- third corrective
-- pass, R3-F2 supplement.
--
-- Discovered during the full dependency audit (not one of the two functions
-- the review named): public.set_updated_at() is called by a CREATE TRIGGER
-- in organization_and_event_product_foundation.sql (Feature 002, committed)
-- but -- like the authorization helpers in
-- 000_authorization_helper_functions_baseline.sql -- has no CREATE FUNCTION
-- anywhere in this migrations directory. It is not an authorization helper,
-- but it is a real fresh-bootstrap dependency of an already-committed
-- migration, so it belongs under version control for the same reason.
--
-- Body below is the EXACT current live definition, verified via
-- pg_get_functiondef() immediately before writing this file -- not
-- reconstructed from memory, per this corrective pass's standing instruction
-- for security/behavior-bearing database code. CREATE OR REPLACE is
-- idempotent and safe against both the current live database (replaces with
-- a byte-for-byte-equivalent body) and a fresh database where it does not
-- exist yet.
--
-- Named separately from 000_authorization_helper_functions_baseline.sql
-- (not folded into that already-applied file, per this repository's
-- migration-immutability rule) but placed immediately after it in
-- supabase/migrations/MIGRATION_ORDER.md's required fresh-bootstrap order,
-- since organization_and_event_product_foundation.sql needs both.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
