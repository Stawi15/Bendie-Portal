# Shell Contract (030): what later features may rely on

## Components and hooks

| API | Guarantee |
|---|---|
| `useEventWorkspace()` | The single source for event access, section availability, product state, Planner capabilities, redirects, journey and Manage modules. Both layouts use it. **Later features must not re-implement availability.** |
| `<AppShell>` | v2 frame: `sidebar`, `toolbar` (optional), `breadcrumbs`, `children` (page), right panel slot |
| `useRightPanel()` | `open(contentId, invoker)`, `close()`, `isOpen`, `contentId`. Focus returns to the invoker. ⌘. / Ctrl+. toggles only when content is registered. Respects reduced motion. |
| `registerRightPanelContent(id, Component)` | How the inspector or Copilot features will add content (not used in 030) |
| `<ContextStrip>` | Org › event, product chips (text + tokens), visibility sentence, role |
| `EVENT_SECTIONS[].area` | Display grouping only. Never used for permissions. |
| `resolveShell(cookie, query)` | `v1` unless `v2` is chosen |

## URLs

All existing routes are unchanged. `?shell=v1|v2` is the only new query parameter. `?product=` handling is unchanged.

## Behaviour guarantees

1. With `v1`, the UI is exactly as before 030.
2. For any role and path, v1 and v2 produce the same final URL and the same access outcome.
3. v2 controls meet ≥3:1 focus contrast, and reduced motion removes sidebar and panel motion.
