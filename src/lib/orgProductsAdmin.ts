import type { ProductState } from '@/types/database';
import type { ProductKey } from '@/lib/eventAuth';

/**
 * Feature 022 — Organisation products management (platform admins). Pure helpers shared by the
 * admin pages and the /api/admin/organizations routes: product labels, product state, request
 * validation and Planner slug derivation. No Supabase calls here.
 */

export type { ProductKey };

export const PRODUCT_KEYS: ProductKey[] = ['bendie', 'planner'];

export const PRODUCT_LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

export const PRODUCT_STATE_LABEL: Record<ProductState, string> = { active: 'Active', paused: 'Paused', none: 'Not included' };

/** Stawi Experiences' own Planner organisation — never offered as a client connection. */
export const STAWI_PLANNER_ORG_ID = 1;

export function productStateOf(rows: { product_key: string; is_active: boolean }[], product: ProductKey): ProductState {
  const row = rows.find((r) => r.product_key === product);
  if (!row) return 'none';
  return row.is_active ? 'active' : 'paused';
}

export const isProductKey = (value: unknown): value is ProductKey => value === 'bendie' || value === 'planner';

/** Lowercase, dash-separated, ≤ 60 chars; falls back to "organisation". */
export function plannerSlugFrom(name: string, slug?: string | null): string {
  const base = (slug && slug.trim() ? slug : name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return base || 'organisation';
}

export type PlannerChoice = { mode: 'existing'; plannerOrganizationId: number } | { mode: 'new' };

type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

function parsePlannerChoice(raw: unknown): Valid<PlannerChoice> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Choose how to connect Planner.' };
  const r = raw as Record<string, unknown>;
  if (r.mode === 'new') return { ok: true, value: { mode: 'new' } };
  if (r.mode === 'existing' && typeof r.plannerOrganizationId === 'number' && Number.isInteger(r.plannerOrganizationId)) {
    return { ok: true, value: { mode: 'existing', plannerOrganizationId: r.plannerOrganizationId } };
  }
  return { ok: false, error: 'Choose a Planner organisation, or create a new one.' };
}

export type CreateOrganizationBody = { name: string; slug: string | null; products: ProductKey[]; planner: PlannerChoice | null };

export function parseCreateOrganizationBody(raw: unknown): Valid<CreateOrganizationBody> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Malformed request.' };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return { ok: false, error: 'Organisation name is required.' };
  if (name.length > 200) return { ok: false, error: 'Organisation name must be 200 characters or fewer.' };
  const slug = typeof r.slug === 'string' && r.slug.trim() ? r.slug.trim() : null;
  const products = Array.isArray(r.products) ? r.products : [];
  if (products.length === 0) return { ok: false, error: 'Choose at least one product.' };
  if (!products.every(isProductKey) || new Set(products).size !== products.length) return { ok: false, error: 'Products must be Bendie and/or Bendie Planner.' };
  const hasPlanner = (products as ProductKey[]).includes('planner');
  let planner: PlannerChoice | null = null;
  if (hasPlanner) {
    const choice = parsePlannerChoice(r.planner);
    if (!choice.ok) return choice;
    planner = choice.value;
  } else if (r.planner) {
    return { ok: false, error: 'A Planner connection was given without the Planner product.' };
  }
  return { ok: true, value: { name, slug, products: products as ProductKey[], planner } };
}

export function parsePlannerConnectionBody(raw: unknown): Valid<PlannerChoice> {
  return parsePlannerChoice(raw);
}

export type ProductSwitchBody = { active: boolean; expectedActive: boolean | null; pausePlannerAppAccess: boolean };

export function parseProductSwitchBody(raw: unknown): Valid<ProductSwitchBody> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Malformed request.' };
  const r = raw as Record<string, unknown>;
  if (typeof r.active !== 'boolean') return { ok: false, error: '"active" must be true or false.' };
  if (!(typeof r.expectedActive === 'boolean' || r.expectedActive === null)) return { ok: false, error: '"expectedActive" must be true, false or null.' };
  return { ok: true, value: { active: r.active, expectedActive: r.expectedActive as boolean | null, pausePlannerAppAccess: r.pausePlannerAppAccess === true } };
}
