-- Feature 004 (Event Product Selection & Planner Provisioning) -- Phase 2.
--
-- Atomically creates the Portal-side foundation for a new event: the events
-- row, its event_products, the creator's event_members access, and its
-- initial Planner-provisioning state -- closing the pre-existing gap where
-- creation only ever wrote the events row (CreateEventModal.tsx's direct
-- client INSERT, with no event_products/event_members write at all).
--
-- SECURITY DEFINER, matching the established shape of every other
-- privileged mutation in this schema (enforce_event_member_role_immutability,
-- get_event_planner_sync_status, enforce_event_product_org_consistency):
-- internal re-verification before acting, minimum necessary mutation scope,
-- no arbitrary-table mutation (every INSERT target/column list below is
-- fixed, never built from a parameter).
--
-- Idempotency (both layers, per the /speckit.analyze correction):
--   - same idempotency_key + same organization_id/products -> returns the
--     already-created event, no new writes (creation-request idempotency).
--   - same idempotency_key + DIFFERENT organization_id/products -> raises
--     idempotency_conflict rather than silently returning the unrelated
--     prior event.
--
-- Authorization performed INSIDE this function, not only by the calling
-- route (defense in depth, Constitution Principle IV):
--   - caller must be portal_is_global_admin() OR
--     is_organization_admin(p_organization_id) -- events_insert_creator's
--     exact existing predicate, reused verbatim.
--   - every requested product must have an active organization_products
--     row for the organization.
--   - if 'planner' is requested, organization_planner_links must still
--     have a row for the organization -- closes the TOCTOU gap found
--     during /speckit.analyze between the calling route's own Phase 0
--     mapping check and this transaction actually running.

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
BEGIN
  -- 1. Idempotency check (must be first -- a hit performs no further writes).
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

  -- 2. Authorization re-check (events_insert_creator's exact predicate).
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

  -- 3. Per-product active-entitlement validation.
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

  -- 4. Planner-mapping re-check (closes the TOCTOU gap found during
  --    /speckit.analyze -- the calling route already checks this in its
  --    own Phase 0, but this internal check guarantees FR-019's "zero
  --    writes without a usable mapping" holds even in the narrow race
  --    window between that check and this transaction running).
  IF 'planner' = ANY(p_products) AND NOT EXISTS (
    SELECT 1 FROM public.organization_planner_links opl
    WHERE opl.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'planner_mapping_missing: organization has no Bendie Planner organization mapping'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Create the Portal event.
  INSERT INTO public.events (organization_id, name, location, starts_at, ends_at, status, created_by)
  VALUES (p_organization_id, p_name, p_location, p_starts_at, p_ends_at, 'draft', v_caller)
  RETURNING id INTO v_event_id;

  -- 6. Record product usage -- exactly the validated selection, never more.
  FOREACH v_product IN ARRAY p_products LOOP
    INSERT INTO public.event_products (event_id, product_key, organization_id)
    VALUES (v_event_id, v_product, p_organization_id);
  END LOOP;

  -- 7. Grant the creator workspace access -- every product mix, uniformly.
  INSERT INTO public.event_members (event_id, user_id, organization_id, role)
  VALUES (v_event_id, v_caller, p_organization_id, 'admin');

  -- 8. Initial provisioning state.
  v_initial_status := CASE WHEN 'planner' = ANY(p_products) THEN 'pending' ELSE 'not_required' END;
  UPDATE public.events SET planner_provisioning_status = v_initial_status WHERE id = v_event_id;

  -- 9. Record the idempotency mapping.
  INSERT INTO public.event_creation_requests (idempotency_key, event_id, organization_id, products)
  VALUES (p_idempotency_key, v_event_id, p_organization_id, p_products);

  RETURN QUERY SELECT v_event_id, v_initial_status;
END;
$function$;
