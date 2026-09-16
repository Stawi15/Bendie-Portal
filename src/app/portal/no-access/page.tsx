'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Safe no-organization/no-access state (Feature 003 FR-002). Reached by an
 * authenticated user who is not a platform admin and holds zero
 * organization_members rows. Renders no organization, event, or other tenant
 * data -- there is deliberately nothing here to fetch.
 */
export default function NoAccessPage() {
  const { logout } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">domain_disabled</span>
      <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">No organisation yet</h1>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
        Your account isn&apos;t a member of any organisation yet. Ask an administrator to add you, then sign in again.
      </p>
      <button onClick={() => logout()} className="btn-secondary mt-4">
        Log out
      </button>
    </div>
  );
}
