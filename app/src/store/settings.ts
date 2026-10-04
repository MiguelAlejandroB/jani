import { get, set } from 'idb-keyval';

export const AREA_MIN_HA = 0.5;
export const AREA_MAX_HA = 10;
export const AREA_STEP_HA = 0.5;
export const AREA_DEFAULT_HA = 2;

const ACTIVE_KEY = 'settings:activePackId';
const AREA_KEY = 'settings:areaHa';

export const getActivePackId = (): Promise<string | undefined> => get<string>(ACTIVE_KEY);
export const setActivePackId = (id: string): Promise<void> => set(ACTIVE_KEY, id);
export const getAreaHa = (): Promise<number | undefined> => get<number>(AREA_KEY);
export const setAreaHa = (ha: number): Promise<void> => set(AREA_KEY, ha);

// Ubicación para elegir el clima del punto más cercano. Solo vive en este teléfono: no se envía ni va en los casos.
export type SavedLocation = { lat: number; lon: number; accuracy: number; date: string };
const LOCATION_KEY = 'settings:location';
export const getLocation = (): Promise<SavedLocation | undefined> => get<SavedLocation>(LOCATION_KEY);
export const setLocation = (loc: SavedLocation): Promise<void> => set(LOCATION_KEY, loc);
