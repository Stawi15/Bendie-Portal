-- Feature 004 -- post-review corrective pass (R3, R4, R5).
--
-- Replaces create_event_with_products' body in place (CREATE OR REPLACE,
-- same signature -- no drop/recreate, no EXECUTE-grant churn: the lockdown
-- from create_event_with_products_execute_lockdown.sql already applies to
-- this signature and is untouched by this migration). Three independent
-- corrections, all inside the same function body:
--
-- R4 -- Authorization is now the FIRST check in the function, before the
-- idempotency lookup. Previously, a caller who already knew a valid
-- idempotency_key could read back an existing event's id/provisioning
-- status via the fast-return path without the function's own
-- authorization check ever running (the calling route's own auth check
-- still applied, but the RPC's own internal defense-in-depth did not, for
-- this one path). Now: even the idempotent-replay path requires the
-- caller to currently pass portal_is_global_admin() OR
-- is_organization_admin(p_organization_id) -- if a caller's organization
-- role was revoked after their original request, a replay of their old
-- idempotency_key is denied, exactly like a fresh request would be.
--
-- R5 -- p_products is now validated for duplicates (RAISE invalid_request)
-- before anything else touches it, and canonicalized (sorted) once
-- validated -- both to guarantee a direct RPC caller can never reach
-- event_products' own PRIMARY KEY (event_id, product_key) as a raw
-- constraint violation, and so idempotency comparison recognizes
-- ['planner','bendie'] and ['bendie','planner'] as the same logical
-- request (the only two multi-product orderings possible).
--
-- R3 -- The actual creation sequence (events/event_products/event_members/
-- provisioning-status/event_creation_requests) is now wrapped in its own
-- BEGIN/EXCEPTION block. Two concurrent calls with the SAME
-- idempotency_key can both pass the pre-check "not found" read (the
-- pre-check is a fast-path optimization, not the correctness mechanism --
-- it never was); event_creation_requests' own PRIMARY KEY is what actually
-- decides the race, at this block's final INSERT. The losing call's
-- EXCEPTION handler:
--   1. confirms (via GET STACKED DIAGNOSTICS) the violation is specifically
--      event_creation_requests_pkey -- any other unique_violation is
--      re-raised unchanged, never misinterpreted as a race;
--   2. relies on PL/pgSQL's implicit SAVEPOINT-per-exception-block
--      behavior to have already rolled back every row this losing call's
--      own attempt had just inserted (events/event_products/event_members)
--      -- nothing is left behind, there is never a second, hidden event;
--   3. re-reads the now-guaranteed-committed winning request and, if its
--      organization_id/products genuinely match, returns the winner's
--      event -- exactly what a fresh replay of the same key would have
--      returned; if they do not match (a same-key-different-payload race,
--      not merely a same-key-same-payload one), raises the same
--      idempotency_conflict a sequential replay would raise instead.
--
-- Live-verified in this pass: a DO-block mechanism test reproducing this
-- exact BEGIN/EXCEPTION/GET STACKED DIAGNOSTICS/SAVEPOINT-rollback/recovery
-- sequence against the real database (see the corrective pass's own live
-- verification notes in research.md and tasks.md T093) -- genuine
-- concurrent HTTP-level request racing was not reproducible in this
-- non-interactive session (no ability to hold two overlapping database
-- sessions open across separate tool calls); the mechanism test is the
-- strongest available evidence and is documented as such, not conflated
-- with a true concurrent-request reproduction.

CREATE OR REPLACE FUNCTION public.create_event_with_products(
  p_idempotency_key uuid,
  p_organization_id uuid,
  p_name text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_products text[]
)
RETURNS TABLE(event_id uuid, planner_provisioning_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_request public.event_creation_requests%ROWTYPE;
  v_event_id uuid;
  v_product text;
  v_initial_status text;
  v_caller uuid := auth.uid();
  v_constraint text;
BEGIN
  -- 1. Authorization re-check FIRST (R4) -- must hold for a brand-new
  --    creation AND an idempotent replay alike. A caller must never be
  --    able to read back an existing event purely by knowing its
  --    idempotency key after losing their own authorization for that
  --    organization. events_insert_creator's exact existing predicate,
  --    reused verbatim (matches the union of the "events_insert_creator"
  --    and "Global admins can manage all events" RLS policies).
  IF NOT (
    public.portal_is_global_admin()
    OR public.is_organization_admin(p_organization_id)
  ) THEN
    RAISE EXCEPTION 'forbidden: caller is not authorized to create events for this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_products IS NULL OR array_length(p_products, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_request: at least one product must be selected'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 2. Reject duplicate product values outright (R5). Product selection
  --    must be one of the three canonical sets {bendie}, {planner},
  --    {bendie,planner} -- a duplicate is malformed input, not an
  --    instruction to silently de-duplicate, and must never be allowed to
  --    fall through to event_products' own PRIMARY KEY
  --    (event_id, product_key) as a raw constraint violation.
  IF (SELECT count(DISTINCT p) FROM unnest(p_products) AS p) <> array_length(p_products, 1) THEN
    RAISE EXCEPTION 'invalid_request: duplicate product values are not allowed'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Canonicalize product order for storage/comparison only (R5) -- the
  --    documented product-selection sets are unordered; sorting here
  --    means the idempotency comparison below (and any future replay)
  --    recognizes ['planner','bendie'] and ['bendie','planner'] as the
  --    same logical request. This does not change what is recorded in
  --    event_products -- every validated entry is still inserted exactly
  --    once, in this canonical order.
  SELECT array_agg(p ORDER BY p) INTO p_products FROM unnest(p_products) AS p;

  -- 4. Idempotency check -- now only reachable once authorization and
  --    input validation both hold.
  SELECT * INTO v_existing_request
  FROM public.event_creation_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_request.organization_id = p_organization_id
       AND v_existing_request.products = p_products THEN
      RETURN QUERY
        SELECT e.id, e.planner_provisioning_status
        FROM public.events e
        WHERE e.id = v_existing_request.event_id;
      RETURN;
    ELSE
      RAISE EXCEPTION 'idempotency_conflict: idempotency_key already used for a different organization/product selection'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- 5. Per-product active-entitlement validation.
  FOREACH v_product IN ARRAY p_products LOOP
    IF v_product NOT IN ('bendie', 'planner') THEN
      RAISE EXCEPTION 'invalid_request: unrecognized product %', v_product
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_products op
      WHERE op.organization_id = p_organization_id
        AND op.product_key = v_product
        AND op.is_active = true
    ) THEN
      RAISE EXCEPTION 'entitlement_inactive: organization is not actively entitled to product %', v_product
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  -- 6. Planner-mapping re-check (TOCTOU gap closed during /speckit.analyze).
  IF 'planner' = ANY(p_products) AND NOT EXISTS (
    SELECT 1 FROM public.organization_planner_links opl
    WHERE opl.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'planner_mapping_missing: organization has no Bendie Planner organization mapping'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 7. Create the Portal event and its dependent rows inside a
  --    sub-transaction (R3). See this migration's own header comment for
  --    the full race-recovery rationale.
  BEGIN
    INSERT INTO public.events (organization_id, name, location, starts_at, ends_at, status, created_by)
    VALUES (p_organization_id, p_name, p_location, p_starts_at, p_ends_at, 'draft', v_caller)
    RETURNING id INTO v_event_id;

    FOREACH v_product IN ARRAY p_products LOOP
      INSERT INTO public.event_products (event_id, product_key, organization_id)
      VALUES (v_event_id, v_product, p_organization_id);
    END LOOP;

    INSERT INTO public.event_members (event_id, user_id, organization_id, role)
    VALUES (v_event_id, v_caller, p_organization_id, 'admin');

    v_initial_status := CASE WHEN 'planner' = ANY(p_products) THEN 'pending' ELSE 'not_required' END;
    UPDATE public.events SET planner_provisioning_status = v_initial_status WHERE id = v_event_id;

    INSERT INTO public.event_creation_requests (idempotency_key, event_id, organization_id, products)
    VALUES (p_idempotency_key, v_event_id, p_organization_id, p_products);

  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'event_creation_requests_pkey' THEN
      -- Not the idempotency race this block exists to recover from --
      -- never silently swallow an unrelated constraint violation.
      RAISE;
    END IF;

    -- A concurrent call committed first under the same idempotency_key
    -- while this call was still creating its own rows -- which the
    -- SAVEPOINT this EXCEPTION block implies has already rolled back in
    -- full (events/event_products/event_members never persist for the
    -- loser). Recover exactly like a fresh replay would.
    SELECT * INTO v_existing_request
    FROM public.event_creation_requests
    WHERE idempotency_key = p_idempotency_key;

    IF NOT FOUND THEN
      -- Not reachable in practice -- the constraint violation guarantees a
      -- committed conflicting row exists. Defensive only.
      RAISE EXCEPTION 'invalid_request: could not recover from a concurrent creation race'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_existing_request.organization_id IS DISTINCT FROM p_organization_id
       OR v_existing_request.products IS DISTINCT FROM p_products THEN
      RAISE EXCEPTION 'idempotency_conflict: idempotency_key already used for a different organization/product selection'
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN QUERY
      SELECT e.id, e.planner_provisioning_status
      FROM public.events e
      WHERE e.id = v_existing_request.event_id;
    RETURN;
  END;

  RETURN QUERY SELECT v_event_id, v_initial_status;
END;
$function$;
