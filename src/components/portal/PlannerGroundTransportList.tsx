'use client';

import type { PlannerMovementClient } from '@/components/portal/PlannerMovementModal';
import type { PlannerVehicleClient } from '@/components/portal/PlannerVehicleModal';

export type PlannerAssignmentClient = {
  id: number;
  passengerId: number;
  passengerName: string;
  vehicleId: number;
  movementId: number;
  boarded: boolean;
  assignedAt: string;
  boardedAt: string | null;
  movedFromVehicleId: number | null;
  notes: string | null;
  flightRecordId: number | null;
};

export type PlannerGroundTransportMovement = Omit<PlannerMovementClient, 'vehicles'> & { vehicles: PlannerGroundTransportVehicle[] };
export type PlannerGroundTransportVehicle = Omit<PlannerVehicleClient, 'assignments'> & { assignments: PlannerAssignmentClient[] };

type PlannerGroundTransportListProps = {
  movements: PlannerGroundTransportMovement[];
  canManage: boolean;
  busyId: number | null;
  onEditMovement: (movement: PlannerGroundTransportMovement) => void;
  onDeleteMovement: (movement: PlannerGroundTransportMovement) => void;
  onAddVehicle: (movement: PlannerGroundTransportMovement) => void;
  onEditVehicle: (vehicle: PlannerGroundTransportVehicle) => void;
  onDeleteVehicle: (vehicle: PlannerGroundTransportVehicle) => void;
  onAssign: (vehicle: PlannerGroundTransportVehicle) => void;
  onMove: (assignment: PlannerAssignmentClient) => void;
  onUnassign: (assignment: PlannerAssignmentClient) => void;
  onAddMovement?: () => void;
};

/**
 * Feature 013 — renders the Movement → Vehicle → Assignment hierarchy as
 * nested cards, matching spec.md's "make the three-tier structure
 * understandable" requirement rather than exposing raw table structure.
 * Occupancy is always `vehicle.occupancy` (a live count of active
 * assignments the data layer already computed) — never a stale stored
 * counter (spec.md Verified Business Rule / plan.md).
 */
export function PlannerGroundTransportList({
  movements,
  canManage,
  busyId,
  onEditMovement,
  onDeleteMovement,
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  onAssign,
  onMove,
  onUnassign,
  onAddMovement,
}: PlannerGroundTransportListProps) {
  if (movements.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No transport movements added to this event yet.</p>
        {canManage && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">
              Start with a movement (e.g. &quot;Airport Pickup — Day 1&quot;), then add vehicles and assign participants to it. Bulk CSV import isn&apos;t available for Ground Transport — add movements, vehicles and assignments here.
            </p>
            {onAddMovement && (
              <div className="mt-4">
                <button className="btn-primary" onClick={onAddMovement}>
                  Add Movement
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {movements.map((movement) => {
        const movementBusy = busyId === movement.id;
        return (
          <div key={movement.id} className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-label-lg text-label-lg text-on-surface">{movement.movementName}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {movement.route} · {movement.movementDate}
                  {movement.pickupTime ? ` · ${movement.pickupTime.slice(0, 5)}` : ''}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs py-1.5" onClick={() => onAddVehicle(movement)} disabled={movementBusy}>
                    Add Vehicle
                  </button>
                  <button className="btn-secondary text-xs py-1.5" onClick={() => onEditMovement(movement)} disabled={movementBusy}>
                    Edit
                  </button>
                  <button className="btn-danger text-xs py-1.5" onClick={() => onDeleteMovement(movement)} disabled={movementBusy}>
                    Delete
                  </button>
                </div>
              )}
            </div>

            {movement.vehicles.length === 0 ? (
              <p className="text-xs text-on-surface-variant mt-3">No vehicles added to this movement yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {movement.vehicles.map((vehicle) => {
                  const vehicleBusy = busyId === vehicle.id;
                  const vehicleLabel = `${vehicle.vehicleType} #${vehicle.vehicleNo}`;
                  return (
                    <div key={vehicle.id} className="rounded-2xl border border-outline-variant/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-on-surface">
                            {vehicleLabel}{' '}
                            <span className={`text-xs ${vehicle.occupancy >= vehicle.maxCapacity ? 'text-error' : 'text-on-surface-variant'}`}>
                              ({vehicle.occupancy}/{vehicle.maxCapacity})
                            </span>
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {vehicle.route}
                            {vehicle.status ? ` · ${vehicle.status}` : ''}
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex gap-2">
                            <button className="btn-secondary text-xs py-1" onClick={() => onAssign(vehicle)} disabled={vehicleBusy}>
                              Assign
                            </button>
                            <button className="btn-secondary text-xs py-1" onClick={() => onEditVehicle(vehicle)} disabled={vehicleBusy}>
                              Edit
                            </button>
                            <button className="btn-danger text-xs py-1" onClick={() => onDeleteVehicle(vehicle)} disabled={vehicleBusy}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      {vehicle.assignments.length === 0 ? (
                        <p className="text-xs text-on-surface-variant mt-2">No passengers assigned.</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {vehicle.assignments.map((a) => (
                            <li key={a.id} className="flex items-center justify-between text-xs bg-surface-container-low/50 rounded-lg px-2 py-1.5">
                              <span className="text-on-surface">
                                {a.passengerName}
                                {a.boarded && <span className="ml-1 text-primary">· Boarded</span>}
                              </span>
                              {canManage && (
                                <span className="flex gap-1.5">
                                  <button className="text-primary hover:underline" onClick={() => onMove(a)} disabled={busyId === a.id}>
                                    Move
                                  </button>
                                  <button className="text-error hover:underline" onClick={() => onUnassign(a)} disabled={busyId === a.id}>
                                    Unassign
                                  </button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
