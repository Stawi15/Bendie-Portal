import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

/**
 * Feature 010 — narrow, server-only Bendie Planner Checklist data-access
 * module, mirroring `src/lib/plannerVendors.ts`'s Feature 009 shape. Operates
 * directly against the canonical `event_checklist_items` table — no Portal
 * copy, no sync layer.
 *
 * Two verified schema differences from Vendors change this module's contract
 * (see specs/010-bendie-planner-checklist/spec.md):
 * (1) a plain Viewer (`can_view_checklist` only) sees only items they
 *     personally own — a locked product decision mirroring Planner's own
 *     live RLS, not a Vendors-style unfiltered list;
 * (2) `owner_profile_id` must be set at creation (defaulting to the creating
 *     manager) and is then immutable — the live `prevent_unsafe_checklist_item_edit`
 *     trigger raises a hard exception on any status toggle for a row whose
 *     `owner_profile_id` is null, under Portal's service-role write pattern.
 * `is_sourced`/`is_on_site` have no ordering relationship to each other
 * (verified: no stage-cascade trigger exists here, unlike Vendors' three-stage
 * lifecycle) — this module never invents one.
 */

export type ChecklistItem = {
  id: number;
  category: string;
  itemName: string;
  quantityText: string | null;
  specification: string | null;
  dayNumber: number | null;
  eventDayDate: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  isSourced: boolean;
  sourcedAt: string | null;
  sourcedByName: string | null;
  isOnSite: boolean;
  onSiteAt: string | null;
  onSiteByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type ChecklistCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
export type ResolvedChecklistCapability = Extract<ChecklistCapability, { hasPlannerIdentity: true }>;

export type EligibleOwner = { profileId: string; name: string };

export type ChecklistItemCreateInput = {
  itemName: string;
  category?: string | null;
  quantityText?: string | null;
  specification?: string | null;
  notes?: string | null;
  dayNumber?: number | null;
  eventDayDate?: string | null;
  ownerProfileId?: string | null;
  sortOrder?: number;
};

/** Never `category`/`itemName`/`quantityText`/`specification`/`sortOrder`/`ownerProfileId`/`dayNumber`/`eventDayDate` — all immutable after creation (spec Rule 3). */
export type ChecklistItemPatch = Partial<{ isSourced: boolean; isOnSite: boolean; notes: string | null }>;

export class PlannerChecklistValidationError extends Error {
  code: 'invalid_request';
  constructor(message: string) {
    super(message);
    this.code = 'invalid_request';
  }
}

export class PlannerChecklistNotFoundError extends Error {}

const CHECKLIST_SELECT_COLUMNS =
  'checklist_item_id, event_id, category, item_name, quantity_text, specification, sort_order, day_number, event_day_date, ' +
  'owner_profile_id, is_sourced, sourced_at, sourced_by_profile_id, is_on_site, on_site_at, on_site_by_profile_id, ' +
  'notes, created_at, updated_at, created_by_profile_id, ' +
  'owner:profiles!event_checklist_items_owner_profile_id_fkey(full_name), ' +
  'sourced_by:profiles!event_checklist_items_sourced_by_profile_id_fkey(full_name), ' +
  'on_site_by:profiles!event_checklist_items_on_site_by_profile_id_fkey(full_name), ' +
  'created_by:profiles!event_checklist_items_created_by_profile_id_fkey(full_name)';

type ProfileNameEmbed = { full_name: string | null } | { full_name: string | null }[] | null;

type RawChecklistItemRow = {
  checklist_item_id: number;
  event_id: number;
  category: string;
  item_name: string;
  quantity_text: string | null;
  specification: string | null;
  sort_order: number;
  day_number: number | null;
  event_day_date: string | null;
  owner_profile_id: string | null;
  is_sourced: boolean;
  sourced_at: string | null;
  sourced_by_profile_id: string | null;
  is_on_site: boolean;
  on_site_at: string | null;
  on_site_by_profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
  owner?: ProfileNameEmbed;
  sourced_by?: ProfileNameEmbed;
  on_site_by?: ProfileNameEmbed;
  created_by?: ProfileNameEmbed;
};

function embedName(embed: ProfileNameEmbed | undefined): string | null {
  const profile = Array.isArray(embed) ? embed[0] : embed;
  return profile?.full_name?.trim() || null;
}

/** Explicit allowlist projection — `*Name` is null whenever the corresponding `*_profile_id` is null, never fabricated (spec Rule 5). */
function shapeChecklistItem(row: RawChecklistItemRow): ChecklistItem {
  return {
    id: row.checklist_item_id,
    category: row.category,
    itemName: row.item_name,
    quantityText: row.quantity_text,
    specification: row.specification,
    dayNumber: row.day_number,
    eventDayDate: row.event_day_date,
    ownerProfileId: row.owner_profile_id,
    ownerName: row.owner_profile_id ? embedName(row.owner) : null,
    isSourced: row.is_sourced,
    sourcedAt: row.sourced_at,
    sourcedByName: row.sourced_by_profile_id ? embedName(row.sourced_by) : null,
    isOnSite: row.is_on_site,
    onSiteAt: row.on_site_at,
    onSiteByName: row.on_site_by_profile_id ? embedName(row.on_site_by) : null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_profile_id ? embedName(row.created_by) : null,
  };
}

/** Small, self-contained duplicate of `plannerTasks.ts`'s/`plannerVendors.ts`'s identical function (this codebase's established preference for independent per-module duplication). */
export async function resolveCallerPlannerIdentity(portalAuthClient: SupabaseClient, portalUserId: string): Promise<string | null> {
  const { data, error } = await portalAuthClient.from('profiles').select('planner_profile_id').eq('id', portalUserId).maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity (checklist): profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/** Mirrors `resolveVendorCapability` exactly, reading `can_view_checklist`/`can_manage_checklist` instead. Throws on a genuine query error — never returns `canView:false` for a failure. */
export async function resolveChecklistCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedChecklistCapability> {
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
    .select('can_view_checklist, can_manage_checklist')
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
    canView: assignment.can_view_checklist === true || assignment.can_manage_checklist === true,
    canManage: assignment.can_manage_checklist === true,
  };
}

/** Event-scoped active staff, for the create form's owner picker — mirrors `plannerTasks.ts`'s `listAssignableStaff`. */
export async function listEligibleOwners(plannerEventId: number): Promise<EligibleOwner[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_user_assignments').select('profile_id, profiles(full_name)').eq('event_id', plannerEventId).eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((row: { profile_id: string; profiles?: { full_name: string | null } | { full_name: string | null }[] | null }) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { profileId: row.profile_id, name: profile?.full_name?.trim() || 'Unnamed staff member' };
  });
}

/**
 * Explicit-column select, ordered to match the live `idx_event_checklist_items_event_sort`
 * index. A Manager (`isManager: true`) sees the full event checklist; a
 * Viewer sees only items they personally own (spec Rule 1 — mirrors
 * Planner's own live RLS, applied server-side since Portal's service-role
 * reads bypass RLS entirely). Throws on a genuine error — never returns `[]`
 * on failure.
 */
export async function listChecklistItems(plannerEventId: number, viewerProfileId: string, isManager: boolean): Promise<ChecklistItem[]> {
  const planner = getPlannerAdminClient();
  let query = planner.from('event_checklist_items').select(CHECKLIST_SELECT_COLUMNS).eq('event_id', plannerEventId);
  if (!isManager) {
    query = query.eq('owner_profile_id', viewerProfileId);
  }
  const { data, error } = await query.order('category', { ascending: true }).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => shapeChecklistItem(row as unknown as RawChecklistItemRow));
}

/** Returns `null` for both "doesn't exist" and "belongs to a different event" — the single item-scope check every mutation below reuses. */
export async function getChecklistItem(plannerEventId: number, itemId: number): Promise<ChecklistItem | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_checklist_items').select(CHECKLIST_SELECT_COLUMNS).eq('checklist_item_id', itemId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  return data ? shapeChecklistItem(data as unknown as RawChecklistItemRow) : null;
}

/**
 * Manager-only (enforced by the route). `ownerProfileId` is resolved to
 * `createdByProfileId` (the creating manager's own identity) when omitted —
 * this table's live edit-guard trigger raises a hard exception on any status
 * toggle for a row with a null owner, so this function never inserts one
 * (spec Rule 4).
 */
export async function createChecklistItem(plannerEventId: number, createdByProfileId: string, input: ChecklistItemCreateInput): Promise<ChecklistItem> {
  const itemName = input.itemName?.trim();
  if (!itemName) throw new PlannerChecklistValidationError('Item name is required.');

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_checklist_items')
    .insert({
      event_id: plannerEventId,
      item_name: itemName,
      category: input.category ?? undefined,
      quantity_text: input.quantityText ?? null,
      specification: input.specification ?? null,
      notes: input.notes ?? null,
      day_number: input.dayNumber ?? null,
      event_day_date: input.eventDayDate ?? null,
      owner_profile_id: input.ownerProfileId ?? createdByProfileId,
      sort_order: input.sortOrder ?? undefined,
      created_by_profile_id: createdByProfileId,
    })
    .select(CHECKLIST_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return shapeChecklistItem(data as unknown as RawChecklistItemRow);
}

/**
 * Maps only `isSourced→is_sourced`, `isOnSite→is_on_site`, `notes→notes`.
 * Never computes or validates any relationship between the two booleans —
 * verified there is none (spec Rule 2). Omission vs. explicit value: a
 * boolean is included only when `typeof patch.X === 'boolean'`; `notes` only
 * when `'notes' in patch` — matching `plannerVendors.ts`'s identical idioms.
 * Throws `PlannerChecklistValidationError` if the patch is empty.
 */
export async function updateChecklistItem(plannerEventId: number, itemId: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const updates: Record<string, unknown> = {};
  if (typeof patch.isSourced === 'boolean') updates.is_sourced = patch.isSourced;
  if (typeof patch.isOnSite === 'boolean') updates.is_on_site = patch.isOnSite;
  if ('notes' in patch) updates.notes = patch.notes ?? null;

  if (Object.keys(updates).length === 0) {
    throw new PlannerChecklistValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_checklist_items')
    .update(updates)
    .eq('checklist_item_id', itemId)
    .eq('event_id', plannerEventId)
    .select(CHECKLIST_SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerChecklistNotFoundError('Checklist item not found.');
  return shapeChecklistItem(data as unknown as RawChecklistItemRow);
}

/** Hard delete, manager-only (enforced by the route) — no soft-delete column, no DELETE trigger exists on this table (verified). */
export async function deleteChecklistItem(plannerEventId: number, itemId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_checklist_items').delete().eq('checklist_item_id', itemId).eq('event_id', plannerEventId).select('checklist_item_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerChecklistNotFoundError('Checklist item not found.');
}

/**
 * Maps every thrown error to a safe, documented category — never a raw
 * Postgres/trigger exception string. This also safely covers the edge case
 * where a pre-existing, Planner-native item has `owner_profile_id IS NULL`:
 * the live trigger raises `'You are not authorized to edit this checklist
 * item.'` on any status toggle for such a row, which is caught here and
 * reported as an ordinary write failure, never a raw exception surfaced to
 * the client.
 */
export function normalizePlannerChecklistError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerChecklistValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerChecklistNotFoundError) {
    return { category: 'checklist_item_not_found', message: err.message };
  }
  console.error('plannerChecklist: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
