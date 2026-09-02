"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Office {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Vehicle {
  id: string;
  officeId: string;
  label: string;
  /** e.g. 트랙터/드론/콤바인 — must match a WorkType's equipmentType for this vehicle to be eligible for that work. */
  equipmentType: string;
  dailyCapacityMin: number;
  dayStartTime: string;
  active: boolean;
}

export interface WorkType {
  id: string;
  name: string;
  /** The kind of equipment this work requires (경운→트랙터, 방제→드론, 수확→콤바인, ...). Only vehicles with a matching equipmentType are dispatched for this work type's parcels. */
  equipmentType: string;
  /** area processed per minute */
  speedValue: number;
  speedUnit: string;
  fixedOverheadMin: number;
}

// Starting suggestions shown in equipment-type pickers, seeded from the
// three work types below. Not an enforced enum — a user can still type a
// custom value — but picking from this list (or a value already in use
// elsewhere) is what keeps a work type's equipmentType and a vehicle's
// equipmentType actually matching instead of silently drifting apart.
export const EQUIPMENT_TYPE_SUGGESTIONS = ["트랙터", "드론", "콤바인"];

export type JobStatus = "DRAFT" | "DISPATCHED";

export interface Job {
  id: string;
  officeId: string;
  /** ISO date, e.g. 2026-08-26 — first day of the work-date range */
  workDate: string;
  /** ISO date, inclusive — last day of the range; equals workDate for a single-day job */
  endDate: string;
  status: JobStatus;
}

export type ParcelSource = "EXCEL" | "MAP";

export interface Parcel {
  id: string;
  jobId: string;
  address: string;
  pnu?: string;
  lat: number;
  lng: number;
  geometry?: unknown;
  areaSqm: number;
  workTypeId: string;
  estimatedMin?: number;
  source: ParcelSource;
  unassigned: boolean;
}

export interface RouteStopEntry {
  parcelId: string;
  sequence: number;
  travelFromPrevMin: number;
  arrivalTime: string;
  departureTime: string;
  /** Road-following path from the previous stop (or depot) to this stop; falls back to a straight line when unavailable. */
  pathFromPrev?: { lat: number; lng: number }[];
}

export interface RouteEntry {
  id: string;
  jobId: string;
  vehicleId: string;
  /** ISO date — which day of the job's range this route runs on */
  date: string;
  totalTravelMin: number;
  totalWorkMin: number;
  totalMin: number;
  stops: RouteStopEntry[];
}

// Seed office so a brand-new install has something to look at right away.
// Coordinates geocoded from the given address via VWorld.
const DEFAULT_OFFICES: Office[] = [
  {
    id: "office-geumcheon-nh",
    name: "금천농협",
    address: "전라남도 나주시 금천면 오강리 222-15",
    lat: 35.033884402511134,
    lng: 126.75342483518452,
  },
];

// Arbitrary placeholder speed values (sqm processed per minute), adjustable
// from /admin/work-types. 1 ha = 10,000 sqm.
const DEFAULT_WORK_TYPES: WorkType[] = [
  { id: "wt-plow", name: "경운", equipmentType: "트랙터", speedValue: 50, speedUnit: "sqm_per_min", fixedOverheadMin: 10 },
  { id: "wt-spray", name: "방제", equipmentType: "드론", speedValue: 83.3, speedUnit: "sqm_per_min", fixedOverheadMin: 10 },
  { id: "wt-harvest", name: "수확", equipmentType: "콤바인", speedValue: 33.3, speedUnit: "sqm_per_min", fixedOverheadMin: 15 },
];

function createId(): string {
  return crypto.randomUUID();
}

interface DispatchStoreState {
  offices: Office[];
  vehicles: Vehicle[];
  workTypes: WorkType[];
  jobs: Job[];
  parcels: Parcel[];
  routes: RouteEntry[];

  addOffice: (data: Omit<Office, "id">) => Office;
  removeOffice: (id: string) => void;
  addVehicle: (data: Omit<Vehicle, "id" | "active">) => Vehicle;
  updateVehicle: (id: string, patch: Partial<Omit<Vehicle, "id">>) => void;
  removeVehicle: (id: string) => void;
  addWorkType: (data: Omit<WorkType, "id">) => WorkType;
  updateWorkType: (id: string, patch: Partial<Omit<WorkType, "id">>) => void;
  addJob: (data: Omit<Job, "id" | "status">) => Job;
  updateJob: (id: string, patch: Partial<Omit<Job, "id" | "status">>) => void;
  removeJob: (id: string) => void;
  addParcel: (data: Omit<Parcel, "id" | "unassigned">) => Parcel;
  updateParcel: (id: string, patch: Partial<Omit<Parcel, "id">>) => void;
  removeParcel: (id: string) => void;
  setJobRoutes: (jobId: string, routes: RouteEntry[], unassignedParcelIds: string[]) => void;
}

export const useDispatchStore = create<DispatchStoreState>()(
  persist(
    (set) => ({
      offices: DEFAULT_OFFICES,
      vehicles: [],
      workTypes: DEFAULT_WORK_TYPES,
      jobs: [],
      parcels: [],
      routes: [],

      addOffice(data) {
        const office: Office = { id: createId(), ...data };
        set((state) => ({ offices: [...state.offices, office] }));
        return office;
      },

      removeOffice(id) {
        set((state) => {
          const jobIds = new Set(state.jobs.filter((j) => j.officeId === id).map((j) => j.id));
          return {
            offices: state.offices.filter((o) => o.id !== id),
            vehicles: state.vehicles.filter((v) => v.officeId !== id),
            jobs: state.jobs.filter((j) => j.officeId !== id),
            parcels: state.parcels.filter((p) => !jobIds.has(p.jobId)),
            routes: state.routes.filter((r) => !jobIds.has(r.jobId)),
          };
        });
      },

      addVehicle(data) {
        const vehicle: Vehicle = { id: createId(), active: true, ...data };
        set((state) => ({ vehicles: [...state.vehicles, vehicle] }));
        return vehicle;
      },

      updateVehicle(id, patch) {
        set((state) => ({
          vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        }));
      },

      removeVehicle(id) {
        set((state) => ({ vehicles: state.vehicles.filter((v) => v.id !== id) }));
      },

      addWorkType(data) {
        const workType: WorkType = { id: createId(), ...data };
        set((state) => ({ workTypes: [...state.workTypes, workType] }));
        return workType;
      },

      updateWorkType(id, patch) {
        set((state) => ({
          workTypes: state.workTypes.map((wt) => (wt.id === id ? { ...wt, ...patch } : wt)),
        }));
      },

      addJob(data) {
        const job: Job = { id: createId(), status: "DRAFT", ...data };
        set((state) => ({ jobs: [...state.jobs, job] }));
        return job;
      },

      updateJob(id, patch) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        }));
      },

      removeJob(id) {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.id !== id),
          parcels: state.parcels.filter((p) => p.jobId !== id),
          routes: state.routes.filter((r) => r.jobId !== id),
        }));
      },

      addParcel(data) {
        const parcel: Parcel = { id: createId(), unassigned: false, ...data };
        set((state) => ({ parcels: [...state.parcels, parcel] }));
        return parcel;
      },

      updateParcel(id, patch) {
        set((state) => ({
          parcels: state.parcels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
      },

      removeParcel(id) {
        set((state) => ({ parcels: state.parcels.filter((p) => p.id !== id) }));
      },

      setJobRoutes(jobId, routes, unassignedParcelIds) {
        const unassignedSet = new Set(unassignedParcelIds);
        set((state) => ({
          routes: [...state.routes.filter((r) => r.jobId !== jobId), ...routes],
          jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, status: "DISPATCHED" } : j)),
          parcels: state.parcels.map((p) =>
            p.jobId === jobId ? { ...p, unassigned: unassignedSet.has(p.id) } : p,
          ),
        }));
      },
    }),
    {
      name: "dispatch-planner-store",
      version: 1,
      // v0 -> v1: equipmentType was added to WorkType/Vehicle after some
      // users already had data persisted. Without this, a browser that
      // registered its work types before the update keeps rehydrating them
      // with an empty equipmentType forever (the DEFAULT_WORK_TYPES seed
      // above only runs for a *brand-new* store, not on rehydration) —
      // silently breaking the equipment-matched dispatch, since a blank
      // equipmentType never matches any vehicle's. The three built-in work
      // types can be backfilled by id; a custom work type someone already
      // added has no such signal and is left for manual selection (the
      // "미지정" picker in WorkTypeManager/VehicleManager already covers
      // that case).
      migrate: (persistedState, storedVersion) => {
        const state = persistedState as Partial<DispatchStoreState>;
        if (storedVersion < 1) {
          const defaultsById = new Map(DEFAULT_WORK_TYPES.map((wt) => [wt.id, wt.equipmentType]));
          state.workTypes = state.workTypes?.map((wt) => ({
            ...wt,
            equipmentType: wt.equipmentType || defaultsById.get(wt.id) || "",
          }));
          state.vehicles = state.vehicles?.map((v) => ({ ...v, equipmentType: v.equipmentType || "" }));
        }
        return state as DispatchStoreState;
      },
    },
  ),
);

// Data lives only in this browser (localStorage) — nothing is sent to a
// server for storage. Persist rehydration happens after the first client
// render, so pages that treat a missing record as "not found" should wait
// for this to avoid a false-negative flash before localStorage loads.
export function useStoreHydrated(): boolean {
  // Zustand's persist middleware never attaches `.persist` when `window` is
  // unavailable (e.g. during SSR), so this must not touch it outside of
  // useSyncExternalStore's subscribe/getSnapshot — those only ever run in
  // the browser; the server snapshot below covers the SSR pass instead.
  return useSyncExternalStore(
    (onChange) => useDispatchStore.persist.onFinishHydration(onChange),
    () => useDispatchStore.persist.hasHydrated(),
    () => false,
  );
}
