'use client';

import { EVENT_MEMBER_ROLES, type EventAccessConfig } from '@/lib/eventTeamProvisioning';
import { EVENT_MEMBER_ROLE_LABELS } from '@/lib/portalLabels';

type Props = {
  config: EventAccessConfig;
  onChange: (next: EventAccessConfig) => void;
  bendieAvailable: boolean;
  plannerAvailable: boolean;
  /** Feature 008's own authority boundary — when false, Planner access must be shown read-only/disabled, never silently offered (a UI toggle must never imply it can bypass server authorization). */
  canAdministerPlanner: boolean;
};

/**
 * The one shared "Event Role" + "Product Access" configuration UI, used by
 * every add-people entry point (From organisation, From team, Invite new,
 * Add all). Deliberately visually separated into two sections — this is the
 * locked product decision that Event Role (what someone does) must never
 * look equivalent to Product Access (which application they need).
 */
export function EventAccessConfigFields({ config, onChange, bendieAvailable, plannerAvailable, canAdministerPlanner }: Props) {
  return (
    <div className="space-y-4">
      <div className="border border-outline-variant rounded-xl p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant mb-1">Event Role</p>
        <select
          className="input"
          value={config.eventRole}
          onChange={(e) => onChange({ ...config, eventRole: e.target.value as EventAccessConfig['eventRole'] })}
        >
          {EVENT_MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {EVENT_MEMBER_ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </select>
        <p className="text-xs text-on-surface-variant mt-1.5">Describes what this person does for this event.</p>
      </div>

      {(bendieAvailable || plannerAvailable) && (
        <div className="border border-outline-variant rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Product Access</p>

          {bendieAvailable && (
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="text-sm font-medium text-on-surface block">Bendie</span>
                <span className="text-xs text-on-surface-variant">Attendee-facing event experience</span>
              </span>
              <input
                type="checkbox"
                className="w-5 h-5 accent-primary rounded"
                checked={config.grantBendie}
                onChange={(e) => onChange({ ...config, grantBendie: e.target.checked })}
              />
            </label>
          )}

          {plannerAvailable && (
            <div>
              <span className="text-sm font-medium text-on-surface block">Bendie Planner</span>
              <span className="text-xs text-on-surface-variant block mb-2">Operational event workspace</span>
              {!canAdministerPlanner ? (
                <p className="text-xs text-on-surface-variant italic bg-surface-container-low rounded-lg px-3 py-2">
                  Only an organisation administrator can grant Bendie Planner access. Ask an org admin to configure this after adding this person.
                </p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {(['none', 'viewer', 'manager'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => onChange({ ...config, plannerAccess: choice })}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                        config.plannerAccess === choice ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/30'
                      }`}
                    >
                      {choice === 'none' ? 'No access' : choice === 'viewer' ? 'Viewer' : 'Manager'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
