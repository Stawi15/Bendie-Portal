# Code Standards

Implementation rules and conventions for this project, reflecting what's actually established in the codebase today — not an aspirational pattern from an earlier planning pass. Follow these in every session.

---

## Engineering Mindset

- **Read context files first** — verify against `architecture.md` and `project-overview.md` before assuming.
- **Match the existing pattern, don't introduce a new one** — this codebase already has an established shape for content-editor pages (see `ui-registry.md`'s "Event Basics form pattern"). A new section page should look like a sibling of the existing 16, not a fresh design.
- **Scope is sacred** — only build what the current feature requires.
- **Clean over clever** — this codebase favors plain `useState` + direct Supabase calls over abstraction layers (no service layer, no Server Actions, no react-hook-form in practice). Don't add an abstraction layer for its own sake just because it "would be cleaner" — match the grain of the existing code.

---

## TypeScript

- Explicit types for form state (a `type XForm = {...}` per page, see `basics/page.tsx`).
- `Database` type (`src/types/database.ts`) is **hand-maintained**, not auto-generated from the live schema — when the schema changes (see `schema-reference.md`'s changelog), update this file manually. Consider `mcp__supabase__generate_typescript_types` to regenerate and diff against it when drift is suspected.
- Prefer `unknown` + narrowing over `any`; existing code uses a few `as any`/`as unknown as X` casts around Supabase join results — avoid adding more than necessary, and don't treat them as sanctioned style.

---

## Next.js 14 Conventions

- App Router only.
- **Every content-editor page is a Client Component** (`'use client'` at the top) that fetches and mutates data directly via the shared `supabase` browser client — this project does **not** use the Server Components + Server Actions split that an earlier, now-superseded planning pass assumed. Don't introduce Server Actions for a single new page; it would be inconsistent with all 16 existing sections.
- Route handlers (`app/api/admin/*/route.ts`) are reserved for privileged operations that need the Supabase **service-role** key — never expose the service-role key to client code, and never do a privileged mutation from a page component.
- Dynamic event routes: `app/portal/events/[eventId]/...`, read via `useParams<{ eventId: string }>()`.

---

## File and Folder Naming

- Folders: kebab-case (`info-center`, `activity-log`).
- Component files: PascalCase (`SectionHeader.tsx`, `MetricCard.tsx`).
- Utility/lib files: camelCase (`portalAuth.ts`, `eventSectionMeta.ts`).
- API route files: always `route.ts`.
- One component per file, named exports for shared components (`export function ComponentName(...)`), default export for page components (Next.js requires this).
- `components/portal/` is currently flat — no subfolders by feature yet. Follow that until there's a real need to split it.

---

## Page Component Structure

The established shape (see `basics/page.tsx`, `theme/page.tsx` as reference implementations):

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type XForm = { /* fields matching the relevant columns */ };
const EMPTY: XForm = { /* defaults */ };

export default function XPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<XForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('table').select('*').eq('id', eventId).single().then(({ data, error }) => {
      if (error) toast.error('Failed to load');
      else if (data) setForm({ /* map data → form, with ?? fallbacks */ });
      setLoading(false);
    });
  }, [eventId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('table').update({ /* form → payload */ }).eq('id', eventId);
    if (error) toast.error(error.message); else toast.success('Saved');
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-6"><SectionHeader sectionKey="x" /></div>
      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">
        {/* fields */}
        <div className="pt-2 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## API Route Handlers (privileged operations only)

```typescript
// app/api/admin/create-user/route.ts pattern
export async function POST(request: NextRequest) {
  // 1. Parse + validate the body
  // 2. Build a cookie-based server client, call auth.getUser()
  // 3. Look up profiles.global_role — reject 401/403 if not 'admin'
  // 4. Only then build the service-role client and perform the privileged write
  // 5. Return NextResponse.json(...) with an explicit status code on every branch
}
```

Never skip step 3 because "the UI already checks this" — the route must re-verify itself; the client cannot be trusted.

---

## Supabase Usage

- One shared browser client: `import { supabase } from '@/lib/supabaseClient'`. Do not instantiate a second client in page code.
- Always `.eq('id', eventId)` (or the relevant scoping column) on every read and write — never query a content table without scoping to the current event/organization.
- Always handle the `error` return explicitly — never assume success. Surface it via `toast.error(error.message)`, never render the raw error object.
- Use `.single()` when expecting exactly one row.
- Service-role client (`SUPABASE_SERVICE_ROLE_KEY`) only inside `app/api/admin/*` route handlers, constructed with `auth: { autoRefreshToken: false, persistSession: false }`, and only after verifying the caller server-side.

---

## Error Handling

- Never use empty catch blocks — `portalAuth.ts`'s helpers all `console.error` inside `catch` before returning a safe default (`false`/`null`/`[]`).
- User-facing errors go through `react-hot-toast` with a human-readable message — never a raw Supabase/Postgres error string beyond `error.message`.
- Loading states use the `animate-pulse h-96 bg-surface-container-low rounded-[20px]` skeleton — don't invent a new loading pattern per page.

---

## Dependencies

Installed **and actively used**: `@supabase/ssr`, `@supabase/supabase-js`, `react-hot-toast`, `papaparse`, `clsx`, `tailwind-merge`.

Installed **but not yet wired up anywhere** — available for future features, don't assume they're the current convention until something actually uses them:
- `react-hook-form` + `@hookform/resolvers` + `zod` — forms today are plain `useState`.
- `@dnd-kit/*` — intended for drag-to-reorder (e.g. the Networking Questionnaire Builder), not used yet.
- `react-color` — Theme Colors uses a native `<input type="color">` instead.
- `zustand` — state today is React Context (`AuthContext`, `EventContext`, `OrganizationContext`, `ConfirmContext`).

Before installing anything new: check if an existing dependency already covers it, and update this list if you do add something.

---

## Repository & Migration Hygiene

(Carried forward from the project's maintenance rules — apply these continuously, not just at session end.)

- Create a Supabase migration only when the database schema actually changes — never for frontend/backend logic or documentation changes.
- Review `supabase/migrations/` regularly; delete local migrations that are empty, duplicate, temporary, or fully superseded. **Never** delete a migration already applied to production or required to recreate the current schema.
- After every completed feature, update the relevant file(s) in `context/` — at minimum `progress-tracker.md`, and `architecture.md`/`project-overview.md` if the feature changed structure, scope, or schema usage.
- Keep the repo clean on an ongoing basis: remove dead code (e.g. audit whether `ComingSoonPanel.tsx` is still needed — it currently has zero usages), remove unused files/assets, eliminate duplicate code.
- A task is not complete until: migrations are clean, `context/` reflects the current implementation, and no stray files created during development are left behind.
