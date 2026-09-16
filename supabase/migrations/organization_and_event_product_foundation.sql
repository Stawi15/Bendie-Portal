-- ============================================================
-- Organization Product Entitlements & Event Product Foundation
-- (Feature 002, revised). Foundational, additive-only.
-- organization_members is NOT created here -- it already exists
-- and is only read from (via its existing RLS helpers) by the
-- new member-scoped SELECT policies below. Does not alter
-- event_planner_links or any feature-001 table/semantics.
-- ============================================================

CREATE TABLE public.organization_products (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner')),
  is_active boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, product_key)
);

ALTER TABLE public.organization_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all organization products"
  ON public.organization_products FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their own organization's products"
  ON public.organization_products FOR SELECT
  USING (public.is_organization_member(organization_id));

CREATE TABLE public.event_products (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, product_key),
  FOREIGN KEY (organization_id, product_key) REFERENCES public.organization_products (organization_id, product_key)
);

ALTER TABLE public.event_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all event products"
  ON public.event_products FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their organization's event products"
  ON public.event_products FOR SELECT
  USING (public.is_organization_member(organization_id));

CREATE OR REPLACE FUNCTION public.enforce_event_product_org_consistency()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT e.organization_id INTO v_org_id FROM public.events e WHERE e.id = NEW.event_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'event_products.organization_id (%) must match events.organization_id (%)', NEW.organization_id, v_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_products_org_consistency
  BEFORE INSERT OR UPDATE ON public.event_products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_product_org_consistency();

CREATE TABLE public.organization_planner_links (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  planner_organization_id bigint NOT NULL UNIQUE,
  planner_organization_name text,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_planner_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all organization planner links"
  ON public.organization_planner_links FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE TRIGGER set_organization_planner_links_updated_at
  BEFORE UPDATE ON public.organization_planner_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill (order matters: entitlements before event products, since the
-- composite FK on event_products requires the organization's entitlement
-- row to already exist).
INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT organization_id, 'bendie' FROM public.events
ON CONFLICT (organization_id, product_key) DO NOTHING;

INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT e.organization_id, 'planner'
FROM public.events e
JOIN public.event_planner_links epl ON epl.event_id = e.id
WHERE epl.is_active = true
ON CONFLICT (organization_id, product_key) DO NOTHING;

INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT id, 'bendie', organization_id FROM public.events
ON CONFLICT (event_id, product_key) DO NOTHING;

INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT epl.event_id, 'planner', e.organization_id
FROM public.event_planner_links epl
JOIN public.events e ON e.id = epl.event_id
WHERE epl.is_active = true
ON CONFLICT (event_id, product_key) DO NOTHING;
