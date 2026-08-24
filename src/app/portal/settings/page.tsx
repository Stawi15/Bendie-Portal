'use client';

import { useOrganization } from '@/contexts/OrganizationContext';

export default function SettingsPage() {
  const { organization, loading } = useOrganization();

  return (
    <div className="space-y-md">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <p className="text-body-md font-body-md text-on-surface-variant mt-1">
          Manage portal access and organisation details.
        </p>
      </div>

      <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow">
        <h4 className="font-headline-sm text-headline-sm mb-4">Organisation</h4>
        {loading ? (
          <div className="h-10 bg-surface-container-low rounded-xl animate-pulse w-64" />
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Name</dt>
              <dd className="text-sm text-on-surface font-medium">{organization?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Slug</dt>
              <dd className="text-sm text-on-surface font-medium">{organization?.slug ?? '—'}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
