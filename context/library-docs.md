# Library Docs

Project-specific usage patterns for every third-party library actually in use in Bendie Portal. This file covers how we use each library **in this project** — general docs and training knowledge can be wrong or stale, especially for Supabase, which ships breaking changes frequently.

Read the relevant section before implementing any feature that touches these libraries.

---

## Before Using Any Library

1. Check whether an MCP server is configured for it — the `supabase` MCP server is available in this environment (`get_project_url`, `list_tables`, `get_advisors`, `execute_sql`, `generate_typescript_types`, etc.) and should be preferred over guessing at schema/API shape.
2. Read this file for project-specific patterns that override general library knowledge.
3. Fall back to general training knowledge only when neither of the above covers it — and treat Supabase API specifics from training data as suspect until verified against the MCP server or `@supabase/ssr`'s actual types.

---

## Supabase (`@supabase/supabase-js` + `@supabase/ssr`)

### Browser Client — the only client most code needs

```typescript
// src/lib/supabaseClient.ts — corrected 2026-08-20, this file had drifted from the real code
import { createBrowserClient } from '@supabase/ssr';
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Import this single instance everywhere in `src/` — do not create a second browser client.

### Server Client — constructed inline where needed (no shared file yet)

Both `middleware.ts` and the `app/api/admin/*` routes build their own `createServerClient` from `@supabase/ssr` against the request's cookies, rather than importing a shared `supabaseServer.ts`. If you add a third place that needs a server client, consider extracting a shared helper at that point — don't duplicate a fourth inline copy without at least flagging it.

```typescript
const cookieStore = await cookies();
const supabase = createServerClient(url, anonKey, {
  cookies: {
    getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })); },
    setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
  },
});
```

### Service-Role Client — privileged routes only

```typescript
import { createClient } from '@supabase/supabase-js';
const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

Only ever constructed inside `app/api/admin/*` route handlers, and only *after* verifying the caller is `global_role = 'admin'` via the cookie-based client. Never import or reference `SUPABASE_SERVICE_ROLE_KEY` in any client-executed code.

### DB Queries — the established shape

```typescript
// Read one row, scoped to the current event
const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();

// Update, scoped
const { error } = await supabase.from('events').update({ ...payload }).eq('id', eventId);

// Insert with a returned row
const { data, error } = await supabase.from('table').insert({ ... }).select().single();
```

Always check `error` explicitly, always scope by the relevant id column, always `.single()` when exactly one row is expected.

### RPCs and Edge Functions — for privileged operations RLS can't (or shouldn't) express directly

Some operations are deliberately implemented as `SECURITY DEFINER` Postgres functions or Supabase Edge Functions instead of a plain table write — usually because the operation needs to touch data the calling session's RLS wouldn't otherwise let it see (e.g. hashing a code server-side and never persisting the plaintext), or because it needs a capability RLS can't express at all (sending an email). Established example — resending an event access code (`members/page.tsx`'s `handleResendAccessCode`):

```typescript
// Step 1 — RPC generates a fresh code, invalidates the previous one, returns
// the plaintext exactly once. Table-returning RPCs come back as an array —
// take the first row. This one has no caller-authorization check of its own
// (confirmed by reading its SQL body), so it works from any authenticated
// session regardless of event_members role — don't assume every RPC does.
const { data, error } = await supabase.rpc('issue_event_access_code', {
  p_event_id: eventId,
  p_user_id: userId,
});
const result = (Array.isArray(data) ? data[0] : data) as { access_code: string; expires_at: string } | undefined;

// Step 2 — Edge Function does the actual delivery. It does NOT generate a
// code itself — it only sends the one it's given. Never render the code in
// the UI between these two calls; pass it straight through.
const { error: fnError } = await supabase.functions.invoke('send-event-access-code-email', {
  body: { email, eventName, accessCode: result.access_code, expiresAt: result.expires_at },
});
```

**Rules:**

- Before wiring up any RPC or Edge Function, read its actual definition via the `supabase` MCP (`execute_sql` against `pg_proc`/`pg_get_functiondef` for RPCs, `get_edge_function` for Edge Functions) — function names can be misleading. `resend_email_event_access_code` sounds like it sends an email; it doesn't — it's a thin wrapper around `issue_event_access_code` for the mobile app's email+slug self-service lookup. The email is a separate Edge Function.
- `SECURITY DEFINER` means the function runs with elevated privileges regardless of the caller's RLS — check its body for whether it does its **own** authorization check on the caller (some do, some don't). Don't assume RLS is protecting you just because a function is involved.
- Edge Functions with `verify_jwt: false` (check via `list_edge_functions`) are callable without an authenticated session — expected for flows a locked-out/unauthenticated user needs (like this one), but it also means the portal's own authenticated call carries no special privilege here; the function trusts its input, not the caller.
- If a value should never reach the UI (like a plaintext access code), don't put it in component state at all — pass it directly from one call's result into the next call's arguments.

### Auth

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect('/auth/login'); // or return false/null from a helper, per portalAuth.ts's pattern
```

`profiles.global_role` is the portal-wide gate; `event_members.role` / `organization_members.role` are the finer-grained ones. See `architecture.md`'s Authentication section for the full picture.

### Storage

```typescript
const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
```

Existing pattern from `src/lib/assetUpload.ts`: build a collision-resistant path (`${organizationId}/${crypto.randomUUID()}-${sanitizedFileName}`), upload, get the public URL, then insert a DB row referencing it — and if the DB insert fails, delete the just-uploaded storage object to avoid an orphaned file (`assetUpload.ts` does this explicitly).

---

## papaparse (CSV import)

Used exclusively for the facilitators bulk-import flow (`src/lib/csvImport.ts` + `CsvImportModal.tsx`).

```typescript
Papa.parse<Record<string, string>>(file, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
  transform: (value) => value.trim(),
  complete: (result) => resolve({ headers: result.meta.fields ?? [], rows: result.data }),
  error: (error) => reject(error),
});
```

**Rules:**

- Header matching is case-insensitive and trimmed (`validateHeaders`, `getField`) — never assume exact casing from an uploaded file.
- `downloadCsvTemplate` builds a sample CSV via `Papa.unparse` so admins can see the expected column shape before uploading.
- `parseFlexibleDate` accepts both `"YYYY-MM-DD HH:mm"` and ISO `"YYYY-MM-DDTHH:mm"` — CSV-sourced dates are not guaranteed to be strict ISO.
- `runWithConcurrency` caps parallel row-processing (e.g. per-row inserts) — use it rather than `Promise.all` unbounded when importing many rows.
- If you add a new CSV-importable field to a table (e.g. a new facilitator column), update the CSV template/column spec in the same change — schema-reference.md flags a real incident where two facilitator fields (`role_type`, `linkedin_url`) went live app-side but stayed unreachable from the portal because the CSV template wasn't updated.

---

## react-hot-toast

```typescript
import toast from 'react-hot-toast';
toast.success('Basics saved');
toast.error(error.message);
```

`<Toaster />` is mounted once at the portal layout level. Every mutation (save, delete, upload) must resolve in exactly one toast — success or error, never both, never neither.

---

## Not Yet Adopted (installed, no established pattern to follow)

If you're the first to actually use one of these, you're setting the convention — check with the user/team before assuming a specific approach, and update `code-standards.md`'s dependency list once it's in use:

- **react-hook-form + zod** — no current usage; if a form genuinely needs schema validation, this is the sanctioned pair to reach for, but plain `useState` remains the default for straightforward forms.
- **@dnd-kit** — earmarked for the Networking Questionnaire Builder's option reordering.
- **react-color** — earmarked as a possible upgrade to the native `<input type="color">` used today.
- **zustand** — no current usage; React Context is the established state pattern.
