'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { ProductsCard, type AdminEventItem, type AdminPlannerLink, type AdminProductRow } from '@/components/portal/admin/ProductsCard';
import { OrganisationHistory, type HistoryEntry } from '@/components/portal/admin/OrganisationHistory';
import { PRODUCT_KEYS, PRODUCT_LABEL } from '@/lib/orgProductsAdmin';

type OrgDetail = { id: string; name: string; slug: string | null; created_at: string };

const HISTORY_TABLES = ['organization_products', 'organization_planner_links', 'event_products'];

/**
 * Feature 022 (US2–US5) — one organisation: Products card, Overview and History.
 * Platform admins only (middleware + the page check + platform-admin RLS on every read).
 */
export default function OrganisationAdminDetailPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { isGlobalAdmin, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [link, setLink] = useState<AdminPlannerLink | null>(null);
  const [events, setEvents] = useState<AdminEventItem[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [orgRes, prodRes, linkRes, eventRes, eventProdRes, memberRes, historyRes] = await Promise.all([
      supabase.from('organizations').select('id,name,slug,created_at').eq('id', organizationId).maybeSingle(),
      supabase
        .from('organization_products')
        .select('product_key,is_active,enabled_at,enabled_by,status_changed_at,status_changed_by')
        .eq('organization_id', organizationId),
      supabase
        .from('organization_planner_links')
        .select('planner_organization_id,planner_organization_name,planner_app_paused_at')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase.from('events').select('id,name,starts_at').eq('organization_id', organizationId).order('starts_at', { ascending: false, nullsFirst: false }),
      supabase.from('event_products').select('event_id,product_key').eq('organization_id', organizationId),
      supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase
        .from('organization_audit_log')
        .select('id,table_name,action,row_id,diff,actor_user_id,created_at')
        .eq('organization_id', organizationId)
        .in('table_name', HISTORY_TABLES)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const failed = orgRes.error ?? prodRes.error ?? linkRes.error ?? eventRes.error ?? eventProdRes.error ?? memberRes.error;
    if (failed) {
      setError('We couldn’t load this organisation. Try again.');
      setLoading(false);
      return;
    }
    if (!orgRes.data) {
      setOrg(null);
      setLoading(false);
      return;
    }

    const productsByEvent = (eventProdRes.data ?? []).reduce<Record<string, string[]>>((acc, r) => {
      (acc[r.event_id] ??= []).push(r.product_key);
      return acc;
    }, {});
    const productRows = (prodRes.data ?? []) as AdminProductRow[];
    const historyRows = (historyRes.data ?? []) as HistoryEntry[];

    const actorIds = new Set<string>();
    productRows.forEach((p) => [p.enabled_by, p.status_changed_by].forEach((id) => id && actorIds.add(id)));
    historyRows.forEach((h) => h.actor_user_id && actorIds.add(h.actor_user_id));
    let nameMap: Record<string, string> = {};
    if (actorIds.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name,email').in('id', [...actorIds]);
      nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'A platform admin']));
    }

    setOrg(orgRes.data);
    setProducts(productRows);
    setLink((linkRes.data as AdminPlannerLink | null) ?? null);
    setEvents((eventRes.data ?? []).map((e) => ({ ...e, products: productsByEvent[e.id] ?? [] })));
    setMemberCount(memberRes.count ?? 0);
    setHistory(historyRows);
    setHistoryError(historyRes.error ? 'We couldn’t load the history.' : null);
    setNames(nameMap);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (!authLoading && isGlobalAdmin) load();
  }, [authLoading, isGlobalAdmin, load]);

  if (!authLoading && !isGlobalAdmin) {
    return <p className="text-on-surface-variant">This area is only available to platform admins.</p>;
  }

  const backLink = (
    <Link href="/portal/admin/organisations" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-3">
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span> All organisations
    </Link>
  );

  if (loading) {
    return (
      <div>
        {backLink}
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-surface-container-low rounded w-1/3" />
          <div className="h-40 bg-surface-container-low rounded-[20px]" />
          <div className="h-24 bg-surface-container-low rounded-[20px]" />
        </div>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div>
        {backLink}
        <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px] panel-shadow">
          <p className="text-on-surface-variant mb-4">{error ?? 'This organisation doesn’t exist.'}</p>
          {error && <button type="button" className="btn-secondary" onClick={load}>Try again</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      {backLink}
      <div className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{org.name}</h1>
        <p className="text-body-md font-body-md text-on-surface-variant mt-1">
          {org.slug && <span className="font-mono">{org.slug} · </span>}
          Created {new Date(org.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <ProductsCard organization={org} products={products} link={link} events={events} names={names} onChanged={load} />

        <section className="bg-white border border-outline-variant rounded-[20px] panel-shadow p-5">
          <h2 className="font-semibold text-on-surface mb-3">Overview</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Events</dt>
              <dd className="tabular-nums font-medium text-on-surface">{events.length}</dd>
            </div>
            {PRODUCT_KEYS.map((p) => (
              <div key={p} className="flex justify-between">
                <dt className="text-on-surface-variant">Events using {PRODUCT_LABEL[p]}</dt>
                <dd className="tabular-nums font-medium text-on-surface">{events.filter((e) => e.products.includes(p)).length}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Members</dt>
              <dd className="tabular-nums font-medium text-on-surface">{memberCount}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mt-4">
        <OrganisationHistory entries={history} names={names} error={historyError} />
      </div>
    </div>
  );
}
