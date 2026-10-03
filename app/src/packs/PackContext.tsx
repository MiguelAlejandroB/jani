import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listInstalledPacks } from './loader';
import type { Pack } from './schema';
import { getActivePackId, getAreaHa, setActivePackId, setAreaHa as saveAreaHa } from '../store/settings';

type PackCtx = {
  pack: Pack | null;
  ready: boolean;
  t: (key: string) => string;
  installed: Pack[];
  activate: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  areaHa: number | undefined;
  setAreaHa: (n: number) => Promise<void>;
};

const Ctx = createContext<PackCtx | null>(null);

export function PackProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<Pack[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [areaHa, setAreaState] = useState<number | undefined>();
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [list, id, area] = await Promise.all([listInstalledPacks(), getActivePackId(), getAreaHa()]);
    setInstalled(list);
    setActiveId(id);
    setAreaState(area);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = useCallback(
    async (id: string) => {
      await setActivePackId(id);
      await refresh();
    },
    [refresh],
  );

  const setAreaHa = useCallback(async (n: number) => {
    await saveAreaHa(n);
    setAreaState(n);
  }, []);

  const pack = useMemo(() => installed.find((p) => p.id === activeId) ?? null, [installed, activeId]);

  useEffect(() => {
    if (pack) document.documentElement.lang = pack.language.code;
  }, [pack]);

  const value = useMemo<PackCtx>(
    () => ({
      pack,
      ready,
      t: (key) => pack?.phrases[key] ?? '',
      installed,
      activate,
      refresh,
      areaHa,
      setAreaHa,
    }),
    [pack, ready, installed, activate, refresh, areaHa, setAreaHa],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePack(): PackCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePack fuera de PackProvider');
  return c;
}
