-- Organisation Products Management (Feature 022) -- platform-admin product control for organisations.
--
-- Why this migration exists:
-- Platform admins could only give organisations Bendie / Bendie Planner, pause them, or connect
-- them to a Planner organisation by editing the database by hand. Feature 022 adds a
-- platform-admin-only Organisations area in the Portal (specs/022-org-products-admin/). It needs:
--   * who / when a product was last switched on or off (organization_products.status_changed_*),
--   * a Portal-side mirror of "Planner app access paused" for display
--     (organization_planner_links.planner_app_paused_*; the Planner organisation's own is_active
--     is the enforcing switch, see planner-sql/enforce_planner_organization_active.sql),
--   * a product-change history in organization_audit_log (the existing log_org_content_change()
--     cannot be reused: it reads NEW.id, which organization_products does not have),
--   * an all-or-nothing "create organisation with products and Planner connection" function, so a
--     failed create can never leave an organisation with Planner on but no connection.
-- Additive only. Existing policies are unchanged: organization_products / organization_planner_links
-- writes stay platform-admin only, members keep read access to their own organisation's products.

-- ===========================================================================================
-- 1. Columns
-- ===========================================================================================

ALTER TABLE public.organization_products
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.organization_planner_links
  ADD COLUMN IF NOT EXISTS planner_app_paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS planner_app_paused_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ===========================================================================================
-- 2. Who / when a product's on/off state last changed
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.stamp_organization_product_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if new.is_active is distinct from old.is_active then
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.stamp_organization_product_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_organization_product_status ON public.organization_products;
CREATE TRIGGER trg_stamp_organization_product_status
  BEFORE UPDATE ON public.organization_products
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_product_status();

-- ===========================================================================================
-- 3. Product-change history (organization_audit_log)
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.log_organization_product_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_row_id text;
  v_diff jsonb;
begin
  if tg_table_name = 'organization_products' then
    v_row_id := new.product_key;
  else
    v_row_id := new.planner_organization_id::text;
  end if;

  if tg_op = 'INSERT' then
    v_diff := to_jsonb(new);
  else
    select jsonb_object_agg(o.key, jsonb_build_object('old', o.old_val, 'new', n.new_val))
      into v_diff
      from jsonb_each(to_jsonb(old)) as o(key, old_val)
      join jsonb_each(to_jsonb(new)) as n(key, new_val) using (key)
     where o.old_val is distinct from n.new_val;
    if v_diff is null then
      return new;
    end if;
  end if;

  insert into public.organization_audit_log (organization_id, table_name, action, row_id, diff, actor_user_id)
  values (new.organization_id, tg_table_name, tg_op, v_row_id, v_diff, auth.uid());
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.log_organization_product_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_organization_products ON public.organization_products;
CREATE TRIGGER trg_audit_organization_products
  AFTER INSERT OR UPDATE ON public.organization_products
  FOR EACH ROW EXECUTE FUNCTION public.log_organization_product_change();

DROP TRIGGER IF EXISTS trg_audit_organization_planner_links ON public.organization_planner_links;
CREATE TRIGGER trg_audit_organization_planner_links
  AFTER INSERT OR UPDATE ON public.organization_planner_links
  FOR EACH ROW EXECUTE FUNCTION public.log_organization_product_change();

-- ===========================================================================================
-- 4. Create an organisation with its products and Planner connection, all or nothing
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.admin_create_organization(
  p_name text,
  p_slug text,
  p_products text[],
  p_planner_organization_id bigint DEFAULT NULL,
  p_planner_organization_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
declare
  v_org_id uuid;
  v_product text;
  v_has_planner boolean;
begin
  if not public.portal_is_global_admin() then
    raise exception 'Only platform admins can create organisations.' using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Organisation name is required.' using errcode = 'invalid_parameter_value';
  end if;
  if p_products is null or array_length(p_products, 1) is null then
    raise exception 'Choose at least one product.' using errcode = 'invalid_parameter_value';
  end if;
  foreach v_product in array p_products loop
    if v_product not in ('bendie', 'planner') then
      raise exception 'Unknown product %.', v_product using errcode = 'invalid_parameter_value';
    end if;
  end loop;
  if (select count(distinct p) from unnest(p_products) p) <> array_length(p_products, 1) then
    raise exception 'Each product can be chosen once.' using errcode = 'invalid_parameter_value';
  end if;
  v_has_planner := 'planner' = any(p_products);
  if v_has_planner and p_planner_organization_id is null then
    raise exception 'Connect a Planner organisation to give Planner.' using errcode = 'invalid_parameter_value';
  end if;
  if not v_has_planner and p_planner_organization_id is not null then
    raise exception 'A Planner organisation was given without the Planner product.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_slug, '')), ''), auth.uid())
  returning id into v_org_id;

  foreach v_product in array p_products loop
    insert into public.organization_products (organization_id, product_key, is_active, enabled_by)
    values (v_org_id, v_product, true, auth.uid());
  end loop;

  if v_has_planner then
    insert into public.organization_planner_links (organization_id, planner_organization_id, planner_organization_name, linked_by)
    values (v_org_id, p_planner_organization_id, p_planner_organization_name, auth.uid());
  end if;

  return v_org_id;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_create_organization(text, text, text[], bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text[], bigint, text) TO authenticated;
