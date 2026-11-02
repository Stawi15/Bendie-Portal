'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { CreateOrganizationFlow } from '@/components/portal/admin/CreateOrganizationFlow';
import { ProductStateChip } from '@/components/portal/admin/ProductStateChip';
import { PRODUCT_KEYS, productStateOf } from '@/lib/orgProductsAdmin';

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
};

type ProductRow = { organization_id: string; product_key: string; is_active: boolean };
type LinkRow = { organization_id: string; planner_organization_name: string | null; planner_organization_id: number };

/**
 * Feature 022 (US1) — every organisation with its product states and Planner connection.
 * Platform admins only: the middleware redirects everyone else, and the platform-admin RLS policies
 * are what let this page read every organisation.
 */
export default function OrganisationsAdminPage() {
  const { isGlobalAdmin, loading: authLoading } = useAuth();
  const { addOrganization } = useOrganization();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [orgRes, prodRes, linkRes, eventRes, memberRes] = await Promise.all([
      supabase.from('organizations').select('id,name,slug,created_at').order('name'),
      supabase.from('organization_products').select('organization_id,product_key,is_active'),
      supabase.from('organization_planner_links').select('organization_id,planner_organization_id,planner_organization_name'),
      supabase.from('events').select('organization_id'),
      supabase.from('organization_members').select('organization_id'),
    ]);
    const failed = orgRes.error ?? prodRes.error ?? linkRes.error ?? eventRes.error ?? memberRes.error;
    if (failed) {
      setError('We couldn’t load the organisations. Try again.');
      setLoading(false);
      return;
    }
    const count = (rows: { organization_id: string }[] | null) =>
      (rows ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.organization_id]: (acc[r.organization_id] ?? 0) + 1 }), {});
    setOrgs(orgRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLinks(linkRes.data ?? []);
    setEventCounts(count(eventRes.data));
    setMemberCounts(count(memberRes.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && isGlobalAdmin) load();
  }, [authLoading, isGlobalAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q) || (o.slug ?? '').toLowerCase().includes(q)) : orgs;
  }, [orgs, search]);

  if (!authLoading && !isGlobalAdmin) {
    return <p className="text-on-surface-variant">This area is only available to platform admins.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Organisations</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">Every client organisation, its products and its Bendie Planner connection.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Create organisation
        </button>
      </div>

      <div className="mb-3 max-w-sm">
        <input type="search" className="input w-full" placeholder="Search organisations…" aria-label="Search organisations" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-surface-container-low rounded-xl" />)}</div>
      ) : error ? (
        <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px] panel-shadow">
          <p className="text-on-surface-variant mb-4">{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">domain</p>
          <p className="text-on-surface-variant">{orgs.length === 0 ? 'No organisations yet.' : 'No organisations match your search.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-outline-variant rounded-[20px] panel-shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-on-surface-variant border-b border-outline-variant">
                <th className="px-4 py-2">Organisation</th>
                <th className="px-4 py-2">Bendie</th>
                <th className="px-4 py-2">Bendie Planner</th>
                <th className="px-4 py-2">Planner connection</th>
                <th className="px-4 py-2 text-right">Events</th>
                <th className="px-4 py-2 text-right">Members</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {filtered.map((o) => {
                const orgProducts = products.filter((p) => p.organization_id === o.id);
                const link = links.find((l) => l.organization_id === o.id);
                return (
                  <tr key={o.id} className="hover:bg-surface-container-low/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/portal/admin/organisations/${o.id}`} className="font-semibold text-on-surface hover:text-primary">{o.name}</Link>
                      {o.slug && <p className="text-[11px] text-on-surface-variant font-mono">{o.slug}</p>}
                    </td>
                    {PRODUCT_KEYS.map((p) => (
                      <td key={p} className="px-4 py-2.5"><ProductStateChip state={productStateOf(orgProducts, p)} /></td>
                    ))}
                    <td className="px-4 py-2.5 text-on-surface-variant">{link ? link.planner_organization_name ?? `Planner organisation #${link.planner_organization_id}` : 'Not connected'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{eventCounts[o.id] ?? 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{memberCounts[o.id] ?? 0}</td>
                    <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateOrganizationFlow
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(org) => {
          addOrganization(org);
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}
