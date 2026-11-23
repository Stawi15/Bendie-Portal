'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContextStrip } from '@/components/shell/ContextStrip';
import { SHELL_ITEM, SHELL_ITEM_ACTIVE, SHELL_ITEM_IDLE } from '@/components/shell/OrgSidebar';
import { groupSectionsByArea } from '@/lib/eventAreas';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/*
 * Feature 030 — Studio 2.0 event sidebar (spec US1): six areas, each listing
 * today's sections as a second level. Built ONLY from
 * `useEventWorkspace().visibleSections`, so availability, module choices and
 * paused products behave exactly as in the current layout. Any section is two
 * steps away: open its area, choose the page.
 */

const PLANNER_TAG = (
  <span className="shell-label ml-auto rounded-full bg-product-planner-bg text-product-planner-fg px-1.5 text-[10px] font-semibold">
    Planner
  </span>
);

function BackToOrganisation() {
  return (
    <Link href="/portal/events" className={`${SHELL_ITEM} ${SHELL_ITEM_IDLE}`} title="Organisation">
      <span className="material-symbols-outlined text-[20px] flex-shrink-0" aria-hidden="true">
        arrow_back
      </span>
      <span className="shell-label truncate">Organisation</span>
    </Link>
  );
}

/** Header only: used while access is resolving or denied. */
export function EventSidebarMinimal() {
  return (
    <div className="p-3">
      <BackToOrganisation />
    </div>
  );
}

export function EventSidebar({ ws }: { ws: EventWorkspace }) {
  const {
    activeSection,
    activeSectionKey,
    navSettled,
    visibleSections,
    sectionHref,
    moduleProducts,
    setManageModulesOpen,
  } = ws;
  const { areas, utilities } = useMemo(
    () => groupSectionsByArea(visibleSections),
    [visibleSections]
  );
  const currentArea = activeSection?.area ?? null;

  // The current area starts open; others open on demand (and stay open while you move around).
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(currentArea ? [currentArea] : [])
  );
  useEffect(() => {
    if (currentArea)
      setExpanded((prev) => (prev.has(currentArea) ? prev : new Set(prev).add(currentArea)));
  }, [currentArea]);
  const toggle = (area: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });

  return (
    <>
      <div className="flex-shrink-0 p-3 space-y-3 border-b border-outline-variant">
        <BackToOrganisation />
        <div className="shell-expanded-only px-1">
          <ContextStrip ws={ws} />
        </div>
      </div>

      <nav
        aria-label="Event"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-3"
      >
        {!navSettled ? (
          // Stable placeholder while availability resolves, never a list that changes under you.
          <div className="space-y-2" aria-busy="true" aria-label="Loading event pages">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 rounded-ui-md bg-surface-container-low animate-pulse" />
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {areas.map((group) => {
              const open = expanded.has(group.area);
              const isCurrent = group.area === currentArea;
              const listId = `shell-area-${group.area}`;
              return (
                <li key={group.area}>
                  <button
                    type="button"
                    onClick={() => toggle(group.area)}
                    aria-expanded={open}
                    aria-controls={listId}
                    title={group.label}
                    className={`${SHELL_ITEM} w-full text-left ${isCurrent ? 'text-on-surface font-semibold' : SHELL_ITEM_IDLE}`}
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isCurrent ? 'text-primary' : ''}`}
                      aria-hidden="true"
                    >
                      {group.icon}
                    </span>
                    <span className="shell-label truncate flex-1">{group.label}</span>
                    {isCurrent && <span className="sr-only">(current area)</span>}
                    <span
                      className={`shell-label material-symbols-outlined text-[18px] transition-transform duration-motion-fast ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      expand_more
                    </span>
                  </button>
                  {open && (
                    <ul id={listId} className="shell-expanded-only mt-0.5 mb-1 space-y-0.5">
                      {group.sections.map((section) => {
                        const active = section.key === activeSectionKey;
                        return (
                          <li key={section.key}>
                            <Link
                              href={sectionHref(section)}
                              aria-current={active ? 'page' : undefined}
                              className={`${SHELL_ITEM} pl-11 ${active ? SHELL_ITEM_ACTIVE : SHELL_ITEM_IDLE}`}
                            >
                              <span className="truncate">{section.label}</span>
                              {section.product === 'planner' && PLANNER_TAG}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {navSettled && (utilities.length > 0 || moduleProducts.length > 0) && (
        <div className="flex-shrink-0 p-3 space-y-0.5 border-t border-outline-variant">
          {utilities.map((section) => {
            const active = section.key === activeSectionKey;
            return (
              <Link
                key={section.key}
                href={sectionHref(section)}
                aria-current={active ? 'page' : undefined}
                title={section.label}
                className={`${SHELL_ITEM} ${active ? SHELL_ITEM_ACTIVE : SHELL_ITEM_IDLE}`}
              >
                <span
                  className="material-symbols-outlined text-[20px] flex-shrink-0"
                  aria-hidden="true"
                >
                  {section.icon}
                </span>
                <span className="shell-label truncate">{section.label}</span>
              </Link>
            );
          })}
          {moduleProducts.length > 0 && (
            <button
              type="button"
              onClick={() => setManageModulesOpen(true)}
              title="Manage modules"
              className={`${SHELL_ITEM} w-full text-left ${SHELL_ITEM_IDLE}`}
            >
              <span
                className="material-symbols-outlined text-[20px] flex-shrink-0"
                aria-hidden="true"
              >
                tune
              </span>
              <span className="shell-label truncate">Manage modules</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
