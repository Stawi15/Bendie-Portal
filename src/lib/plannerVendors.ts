import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

/**
 * Feature 009 — narrow, server-only Bendie Planner Vendors data-access module,
 * mirroring `src/lib/plannerTasks.ts`'s Feature 007 shape: explicit column
 * lists (never `select('*')`), narrow single-purpose functions, no
 * route-handler concerns (those live in
 * `src/app/api/events/[eventId]/planner-vendors*`).
 *
 * Operates directly against the canonical `event_vendor_items` table — no
 * Portal-side copy, no sync layer (spec.md FR-012/FR-013). Three live database
 * triggers govern the packed→loaded→on-site lifecycle and actor/timestamp
 * stamping (data-model.md §2); this module never re-implements, second-guesses,
 * or bypasses that behavior (FR-028) — it submits exactly what the caller
 * requested for the fields they touched and returns exactly what the database
 * persisted, via `.select(...)` on the same write, never a second read.
 */

export type VendorItem = {
  id: number;
  category: string;
  description: string;
  quantityText: string | null;
  unit: string | null;
  isPacked: boolean;
  packedAt: string | null;
  packedByName: string | null;
  isLoaded: boolean;
  loadedAt: string | null;
  loadedByName: string | null;
  isOnSite: boolean;
  onSiteAt: string | null;
  onSiteByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type VendorCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

/** The narrower shape callers get once a non-null Planner identity is already confirmed (matches `plannerTasks.ts`'s `ResolvedTaskCapability` precedent). */
export type ResolvedVendorCapability = Extract<VendorCapability, { hasPlannerIdentity: true }>;

export type VendorItemCreateInput = {
  description: string;
  category?: string | null;
  quantityText?: string | null;
  unit?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

/** Never `category`/`description`/`quantityText`/`unit`/`sortOrder`/`event_id` — those are immutable after creation through this feature (FR-038). */
export type VendorItemPatch = Partial<{ isPacked: boolean; isLoaded: boolean; isOnSite: boolean; notes: string | null }>;

export class PlannerVendorValidationError extends Error {
  code: 'invalid_request';
  constructor(message: string) {
    super(message);
    this.code = 'invalid_request';
  }
}

export class PlannerVendorNotFoundError extends Error {}

const VENDOR_SELECT_COLUMNS =
  'vendor_item_id, event_id, category, item_description, quantity_text, unit, sort_order, ' +
  'is_packed, packed_at, packed_by_profile_id, ' +
  'is_loaded, loaded_at, loaded_by_profile_id, ' +
  'is_on_site, on_site_at, on_site_by_profile_id, ' +
  'notes, created_at, updated_at, created_by_profile_id, ' +
  'packed_by:profiles!event_vendor_items_packed_by_profile_id_fkey(full_name), ' +
  'loaded_by:profiles!event_vendor_items_loaded_by_profile_id_fkey(full_name), ' +
  'on_site_by:profiles!event_vendor_items_on_site_by_profile_id_fkey(full_name), ' +
  'created_by:profiles!event_vendor_items_created_by_profile_id_fkey(full_name)';

type ProfileNameEmbed = { full_name: string | null } | { full_name: string | null }[] | null;

type RawVendorItemRow = {
  vendor_item_id: number;
  event_id: number;
  category: string;
  item_description: string;
  quantity_text: string | null;
  unit: string | null;
  sort_order: number;
  is_packed: boolean;
  packed_at: string | null;
  packed_by_profile_id: string | null;
  is_loaded: boolean;
  loaded_at: string | null;
  loaded_by_profile_id: string | null;
  is_on_site: boolean;
  on_site_at: string | null;
  on_site_by_profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
  packed_by?: ProfileNameEmbed;
  loaded_by?: ProfileNameEmbed;
  on_site_by?: ProfileNameEmbed;
  created_by?: ProfileNameEmbed;
};

function embedName(embed: ProfileNameEmbed | undefined): string | null {
  const profile = Array.isArray(embed) ? embed[0] : embed;
  return profile?.full_name?.trim() || null;
}

/**
 * Explicit allowlist projection — never spreads the raw row. `*ByName` is
 * `null` whenever the corresponding `*_by_profile_id` is `null` — including
 * every Portal-originated lifecycle change (the live trigger derives the
 * actor from `auth.uid()`, which is always null under Portal's service-role
 * write pattern) — never substituted with a fabricated or generic name
 * (spec.md FR-032).
 */
function shapeVendorItem(row: RawVendorItemRow): VendorItem {
  return {
    id: row.vendor_item_id,
    category: row.category,
    description: row.item_description,
    quantityText: row.quantity_text,
    unit: row.unit,
    isPacked: row.is_packed,
    packedAt: row.packed_at,
    packedByName: row.packed_by_profile_id ? embedName(row.packed_by) : null,
    isLoaded: row.is_loaded,
    loadedAt: row.loaded_at,
    loadedByName: row.loaded_by_profile_id ? embedName(row.loaded_by) : null,
    isOnSite: row.is_on_site,
    onSiteAt: row.on_site_at,
    onSiteByName: row.on_site_by_profile_id ? embedName(row.on_site_by) : null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_profile_id ? embedName(row.created_by) : null,
  };
}

/** Reads the caller's Planner identity from Portal's own `profiles.planner_profile_id` (Feature 001 bridge). A small, deliberately self-contained duplicate of `plannerTasks.ts`'s identical function — this codebase's established preference for independent per-module duplication over cross-feature-module imports. `null` covers both absence and a genuine read error. */
export async function resolveCallerPlannerIdentity(portalAuthClient: SupabaseClient, portalUserId: string): Promise<string | null> {
  const { data, error } = await portalAuthClient.from('profiles').select('planner_profile_id').eq('id', portalUserId).maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity (vendors): profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/**
 * Mirrors `plannerTasks.ts`'s `resolveTaskCapability` exactly, reading
 * `can_view_vendors`/`can_manage_vendors` instead of the Tasks flags — this is
 * the sole read path for Feature 008's permission model; this feature never
 * administers those flags (FR-010). A genuine query error THROWS — callers
 * (the route handlers) must map that to a distinct `backend_error` response,
 * never to `canView: false` (matching Feature 007's own `/speckit.analyze` H2
 * correction).
 */
export async function resolveVendorCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedVendorCapability> {
  const planner = getPlannerAdminClient();

  const { data: profile, error: profileError } = await planner.from('profiles').select('is_platform_admin, role').eq('id', plannerProfileId).maybeSingle();
  if (profileError) throw profileError;

  const role = (profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = profile?.is_platform_admin === true || ['admin', 'super_admin', 'superadmin'].includes(role);

  if (isPlatformAdmin) {
    return { hasPlannerIdentity: true, canView: true, canManage: true };
  }

  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .select('can_view_vendors, can_manage_vendors')
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  if (!assignment) {
    return { hasPlannerIdentity: true, canView: false, canManage: false };
  }

  return {
    hasPlannerIdentity: true,
    canView: assignment.can_view_vendors === true || assignment.can_manage_vendors === true,
    canManage: assignment.can_manage_vendors === true,
  };
}

/** Explicit-column select, never `select('*')`; scoped strictly to one event. Ordered to match the live `idx_event_vendor_items_event_sort` index. Throws on a genuine read error — never returns `[]` on failure. */
export async function listVendorItems(plannerEventId: number): Promise<VendorItem[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_vendor_items')
    .select(VENDOR_SELECT_COLUMNS)
    .eq('event_id', plannerEventId)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => shapeVendorItem(row as unknown as RawVendorItemRow));
}

/** Returns `null` whenever the item doesn't exist OR doesn't belong to `plannerEventId` — the single item-scope check every mutation below reuses (never reinterpreted against a different event). */
export async function getVendorItem(plannerEventId: number, itemId: number): Promise<VendorItem | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_vendor_items').select(VENDOR_SELECT_COLUMNS).eq('vendor_item_id', itemId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  return data ? shapeVendorItem(data as unknown as RawVendorItemRow) : null;
}

/** Manager-only (enforced by the route). Server controls `event_id`/lifecycle flags/`*_at`/`*_by_profile_id` — none are client-authoritative (FR-022, FR-023, FR-026). */
export async function createVendorItem(plannerEventId: number, createdByProfileId: string, input: VendorItemCreateInput): Promise<VendorItem> {
  const description = input.description?.trim();
  if (!description) throw new PlannerVendorValidationError('Item description is required.');

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_vendor_items')
    .insert({
      event_id: plannerEventId,
      item_description: description,
      category: input.category ?? undefined,
      quantity_text: input.quantityText ?? null,
      unit: input.unit ?? null,
      notes: input.notes ?? null,
      sort_order: input.sortOrder ?? undefined,
      created_by_profile_id: createdByProfileId,
    })
    .select(VENDOR_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return shapeVendorItem(data as unknown as RawVendorItemRow);
}

/**
 * Maps only `isPacked→is_packed`, `isLoaded→is_loaded`, `isOnSite→is_on_site`,
 * `notes→notes` — never computes or validates the packed/loaded/on-site
 * combination itself (the live `trg_enforce_vendor_item_stage_order` trigger
 * is the sole authority for that, data-model.md §2/§4). Omission vs. explicit
 * value: a boolean is included only when `typeof patch.X === 'boolean'` (an
 * omitted key is `undefined`, distinct from an explicit `false`); `notes` is
 * included only when `'notes' in patch` (distinguishes an omitted key from an
 * explicit `null`) — matching `plannerTasks.ts`'s own `patch.X !== undefined` /
 * `'remarks' in body` idioms for the identical shapes. Throws
 * `PlannerVendorValidationError` if the patch is empty (no recognized keys
 * present) — never a silent no-op write.
 */
export async function updateVendorItem(plannerEventId: number, itemId: number, patch: VendorItemPatch): Promise<VendorItem> {
  const updates: Record<string, unknown> = {};
  if (typeof patch.isPacked === 'boolean') updates.is_packed = patch.isPacked;
  if (typeof patch.isLoaded === 'boolean') updates.is_loaded = patch.isLoaded;
  if (typeof patch.isOnSite === 'boolean') updates.is_on_site = patch.isOnSite;
  if ('notes' in patch) updates.notes = patch.notes ?? null;

  if (Object.keys(updates).length === 0) {
    throw new PlannerVendorValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_vendor_items')
    .update(updates)
    .eq('vendor_item_id', itemId)
    .eq('event_id', plannerEventId)
    .select(VENDOR_SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerVendorNotFoundError('Vendor item not found.');
  return shapeVendorItem(data as unknown as RawVendorItemRow);
}

/** Hard delete, manager-only (enforced by the route) — no soft-delete/archive column exists on the live table. Throws `PlannerVendorNotFoundError` for an already-deleted or wrong-event item (a plain not-found, matching `plannerTasks.ts`'s `deleteTask` precedent — not Feature 008's disable-no-op-success shape, since this is a genuine irreversible removal). */
export async function deleteVendorItem(plannerEventId: number, itemId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_vendor_items').delete().eq('vendor_item_id', itemId).eq('event_id', plannerEventId).select('vendor_item_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerVendorNotFoundError('Vendor item not found.');
}

/** Maps any thrown error from the functions above to one of the safe, documented contract categories — never returns raw Planner error text/stack traces (SR-012, FR-039). */
export function normalizePlannerVendorError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerVendorValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerVendorNotFoundError) {
    return { category: 'vendor_item_not_found', message: err.message };
  }
  console.error('plannerVendors: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
