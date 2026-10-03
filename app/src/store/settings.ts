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
