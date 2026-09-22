'use client';

import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Safe no-product state (Feature 006 FR-011/FR-016/FR-047). Reached when the
 * selected organization has zero active `organization_products` rows —
 * distinct from an empty-but-active product (FR-057) and from the
 * no-organization state (/portal/no-access). Renders no product switcher, no
 * event discovery, no event creation entry point; organization-global shared
 * pages remain reachable via the existing OrgSideNav (unaffected by this
 * route — see plan.md's shared-surfaces decision).
 */
export default function NoProductPage() {
  const { organization } = useOrganization();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">apps_outage</span>
      <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">No product set up yet</h1>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
        {organization?.name ?? 'This organisation'} doesn&apos;t currently have an active Bendie or Bendie Planner
        entitlement. Ask an administrator to enable one to start using events here.
      </p>
    </div>
  );
}
