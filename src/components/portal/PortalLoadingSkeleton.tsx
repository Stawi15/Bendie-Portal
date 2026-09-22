/**
 * Shared neutral loading skeleton (Feature 006 corrective fix), reused by
 * every product route and the legacy `/portal`/`/portal/events` redirects —
 * the same shape each of them already rendered independently, extracted
 * here instead of duplicated per file.
 */
export function PortalLoadingSkeleton() {
  return (
    <div className="flex flex-col h-full" aria-busy="true">
      <div className="h-8 w-40 bg-surface-container-low rounded-lg animate-pulse mb-4" />
      <div className="flex-1 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * Safe, neutral entitlement-read-failure state (/code-review finding F1).
 * Never rendered as though the organization owns zero products, and never
 * triggers a redirect — the user is told this is a transient failure, not a
 * real entitlement answer.
 */
export function PortalEntitlementError() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">error</span>
      <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t verify product access</h1>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
        We couldn&apos;t confirm this organisation&apos;s Bendie/Bendie Planner access just now. Please refresh to try
        again.
      </p>
    </div>
  );
}
