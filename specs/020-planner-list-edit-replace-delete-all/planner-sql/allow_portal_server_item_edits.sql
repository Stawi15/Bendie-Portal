-- PLANNER project (zghoaawgrmvqdlksuiam) — NOT the Bendie/Portal project.
-- Feature 020 (Bendie Portal): let the Portal's server edit Checklist / Vendor item details.
--
-- Why: these triggers treat a write as a "manager" write only when the signed-in Planner user is a
-- manager. The Bendie Portal writes with the Planner service role (no signed-in Planner user), so:
--   * detail edits (name/description, category, quantity, unit, spec, owner, day/date) are refused
--     ("Only an admin or ... manager can edit this item's details."), and
--   * ANY checklist update on an item with no owner is refused ("You are not authorized ...").
-- The Portal already checks, on every request, that the caller is a manager of that event before it
-- writes. The ONLY change below is "OR current_setting('role', true) = 'service_role'" on each
-- manager check — the same service-role pattern the Portal database uses for its own guards.
-- Planner-app users (authenticated role) keep exactly the current rules. Everything else is unchanged.
-- Verified 2026-10-12 against the live function definitions.

CREATE OR REPLACE FUNCTION public.prevent_unsafe_checklist_item_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.can_manage_event_checklist(NEW.event_id) OR current_setting('role', true) = 'service_role' THEN
    IF NEW.is_sourced IS DISTINCT FROM OLD.is_sourced THEN
      NEW.sourced_at := CASE WHEN NEW.is_sourced THEN now() ELSE NULL END;
      NEW.sourced_by_profile_id := CASE WHEN NEW.is_sourced THEN auth.uid() ELSE NULL END;
    END IF;
    IF NEW.is_on_site IS DISTINCT FROM OLD.is_on_site THEN
      NEW.on_site_at := CASE WHEN NEW.is_on_site THEN now() ELSE NULL END;
      NEW.on_site_by_profile_id := CASE WHEN NEW.is_on_site THEN auth.uid() ELSE NULL END;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.owner_profile_id IS NULL OR OLD.owner_profile_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to edit this checklist item.';
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.item_name IS DISTINCT FROM OLD.item_name
     OR NEW.quantity_text IS DISTINCT FROM OLD.quantity_text
     OR NEW.specification IS DISTINCT FROM OLD.specification
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.owner_profile_id IS DISTINCT FROM OLD.owner_profile_id
     OR NEW.day_number IS DISTINCT FROM OLD.day_number
     OR NEW.event_day_date IS DISTINCT FROM OLD.event_day_date
  THEN
    RAISE EXCEPTION 'Only an admin or checklist manager can edit this item''s details.';
  END IF;

  IF NEW.is_sourced IS DISTINCT FROM OLD.is_sourced THEN
    NEW.sourced_at := CASE WHEN NEW.is_sourced THEN now() ELSE NULL END;
    NEW.sourced_by_profile_id := CASE WHEN NEW.is_sourced THEN auth.uid() ELSE NULL END;
  ELSIF NEW.sourced_at IS DISTINCT FROM OLD.sourced_at
     OR NEW.sourced_by_profile_id IS DISTINCT FROM OLD.sourced_by_profile_id THEN
    RAISE EXCEPTION 'Cannot edit sourced audit fields directly.';
  END IF;

  IF NEW.is_on_site IS DISTINCT FROM OLD.is_on_site THEN
    NEW.on_site_at := CASE WHEN NEW.is_on_site THEN now() ELSE NULL END;
    NEW.on_site_by_profile_id := CASE WHEN NEW.is_on_site THEN auth.uid() ELSE NULL END;
  ELSIF NEW.on_site_at IS DISTINCT FROM OLD.on_site_at
     OR NEW.on_site_by_profile_id IS DISTINCT FROM OLD.on_site_by_profile_id THEN
    RAISE EXCEPTION 'Cannot edit on-site audit fields directly.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_unsafe_vendor_item_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_packed IS DISTINCT FROM OLD.is_packed THEN
    NEW.packed_at := CASE WHEN NEW.is_packed THEN now() ELSE NULL END;
    NEW.packed_by_profile_id := CASE WHEN NEW.is_packed THEN auth.uid() ELSE NULL END;
  END IF;

  IF NEW.is_loaded IS DISTINCT FROM OLD.is_loaded THEN
    NEW.loaded_at := CASE WHEN NEW.is_loaded THEN now() ELSE NULL END;
    NEW.loaded_by_profile_id := CASE WHEN NEW.is_loaded THEN auth.uid() ELSE NULL END;
  END IF;

  IF NEW.is_on_site IS DISTINCT FROM OLD.is_on_site THEN
    NEW.on_site_at := CASE WHEN NEW.is_on_site THEN now() ELSE NULL END;
    NEW.on_site_by_profile_id := CASE WHEN NEW.is_on_site THEN auth.uid() ELSE NULL END;
  END IF;

  IF public.can_manage_event_vendors(NEW.event_id) OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.item_description IS DISTINCT FROM OLD.item_description
     OR NEW.quantity_text IS DISTINCT FROM OLD.quantity_text
     OR NEW.unit IS DISTINCT FROM OLD.unit
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
  THEN
    RAISE EXCEPTION 'Only an admin or vendor manager can edit this item''s details.';
  END IF;

  IF NEW.is_packed IS DISTINCT FROM OLD.is_packed THEN
    NULL; -- already re-stamped above
  ELSIF NEW.packed_at IS DISTINCT FROM OLD.packed_at
     OR NEW.packed_by_profile_id IS DISTINCT FROM OLD.packed_by_profile_id THEN
    RAISE EXCEPTION 'Cannot edit packed audit fields directly.';
  END IF;

  IF NEW.is_loaded IS DISTINCT FROM OLD.is_loaded THEN
    NULL;
  ELSIF NEW.loaded_at IS DISTINCT FROM OLD.loaded_at
     OR NEW.loaded_by_profile_id IS DISTINCT FROM OLD.loaded_by_profile_id THEN
    RAISE EXCEPTION 'Cannot edit loaded audit fields directly.';
  END IF;

  IF NEW.is_on_site IS DISTINCT FROM OLD.is_on_site THEN
    NULL;
  ELSIF NEW.on_site_at IS DISTINCT FROM OLD.on_site_at
     OR NEW.on_site_by_profile_id IS DISTINCT FROM OLD.on_site_by_profile_id THEN
    RAISE EXCEPTION 'Cannot edit on-site audit fields directly.';
  END IF;

  RETURN NEW;
END;
$function$;
