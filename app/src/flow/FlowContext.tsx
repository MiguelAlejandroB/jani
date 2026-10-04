import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadModelCard, type ModelCard } from '../engine/modelCard';
import { resetSim } from '../engine/see';
import { loadSegCard, type SegCard } from '../engine/segment';
import { usePack } from '../packs/PackContext';
import { saveCase } from '../store/cases';
import type { Case, Choice, DecideResult, PredictResult, RdSummary, SeeResult, Session } from '../engine/types';
import { computeRd } from '../engine/rd/client';
import { buildInputs, type RdResult } from '../engine/rd/run';
import { AREA_DEFAULT_HA } from '../store/settings';

export type FlowPhoto = { url: string; result: SeeResult };
/** Estado del cálculo de RIESGO + DECISIÓN (corre en un Web Worker). 'unavailable': faltan datos en el paquete. */
export type RdState = { status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'; result?: RdResult };

function summarize(r: RdResult): RdSummary {
  return {
    paramsVersion: r.paramsVersion,
    usedDemoData: r.usedDemoData,
    ell: r.risk.ell,
    banderas: r.risk.banderas,
    recomendacion: r.decision?.recomendacion ?? null,
    alternativas: (r.decision?.alternativas ?? []).map((a) => ({ id: a.id, ce: a.margen?.ce ?? null, viable_hoy: a.viable_hoy, razon_no_viable: a.razon_no_viable })),
  };
}

type FlowCtx = {
  card: ModelCard | null;
  /** Ficha del segmentador (filtro "¿hay una hoja?" y severidad). null si no cargó: se clasifica sin filtro. */
  segCard: SegCard | null;
  /** La ficha no se pudo cargar o no es válida: la captura muestra ⚠️ y permite reintentar. */
  cardError: boolean;
  reloadCard: () => void;
  photos: FlowPhoto[];
  session: Session | null;
  heavyRain: boolean | null;
  treated: boolean | null;
  risk: PredictResult | null;
  decision: DecideResult | null;
  choice: Choice | null;
  caseId: string | null;
  savedCase: Case | null;
  rd: RdState;
  /** Calcula RIESGO + DECISIÓN con las fotos de la sesión y la respuesta "¿llovió mucho?". */
  startRd: (heavyRain: boolean) => void;
  startReview: () => void;
  addPhoto: (p: FlowPhoto) => void;
  setSession: (s: Session) => void;
  setAnswers: (heavyRain: boolean, treated: boolean) => void;
  setRisk: (r: PredictResult | null) => void;
  setDecision: (d: DecideResult) => void;
  setChoice: (c: Choice) => void;
  /** Guarda el caso en IndexedDB (sin fotos: solo la sesión). Resuelve cuando ya quedó escrito. */
  saveCurrentCase: (override?: { choice?: Choice }) => Promise<void>;
  setSavedCase: (c: Case) => void;
};

const Ctx = createContext<FlowCtx | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const { pack, areaHa } = usePack();
  const [rd, setRd] = useState<RdState>({ status: 'idle' });
  const rdRun = useRef(0);
  const [card, setCard] = useState<ModelCard | null>(null);
  const [cardError, setCardError] = useState(false);
  const [cardAttempt, setCardAttempt] = useState(0);
  const [segCard, setSegCard] = useState<SegCard | null>(null);
  const [photos, setPhotos] = useState<FlowPhoto[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [heavyRain, setHeavyRain] = useState<boolean | null>(null);
  const [treated, setTreated] = useState<boolean | null>(null);
  const [risk, setRisk] = useState<PredictResult | null>(null);
  const [decision, setDecision] = useState<DecideResult | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const [savedCase, setSavedCase] = useState<Case | null>(null);

  useEffect(() => {
    let alive = true;
    loadModelCard()
      .then((c) => {
        if (!alive) return;
        setCard(c);
        setCardError(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        console.warn('model_card', e);
        setCard(null);
        setCardError(true);
      });
    return () => {
      alive = false;
    };
  }, [cardAttempt]);

  useEffect(() => {
    let alive = true;
    loadSegCard()
      .then((c) => {
        if (alive) setSegCard(c);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        console.warn('seg_card', e);
        setSegCard(null);
      });
    return () => {
      alive = false;
    };
  }, [cardAttempt]);

  const reloadCard = useCallback(() => {
    setCardError(false);
    setCardAttempt((n) => n + 1);
  }, []);

  const startReview = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
    setSession(null);
    setHeavyRain(null);
    setTreated(null);
    setRisk(null);
    setDecision(null);
    setChoice(null);
    setCaseId(null);
    setSavedCase(null);
    setRd({ status: 'idle' });
    rdRun.current++;
    idRef.current = null;
    resetSim();
  }, []);

  // Sesión nueva: riesgo, decisión y elección de una sesión anterior ya no valen.
  const setNewSession = useCallback((s: Session) => {
    setSession(s);
    setRisk(null);
    setDecision(null);
    setChoice(null);
  }, []);

  const startRd = useCallback(
    (heavyRain: boolean) => {
      if (!session || !pack) return;
      const run = ++rdRun.current;
      const inputs = buildInputs(pack, session.results, { areaHa: areaHa ?? AREA_DEFAULT_HA, now: new Date(), heavyRain });
      if (!inputs) {
        setRd({ status: 'unavailable' });
        return;
      }
      setRd({ status: 'loading' });
      computeRd(inputs)
        .then((result) => {
          if (rdRun.current === run) setRd({ status: 'ready', result });
        })
        .catch((e: unknown) => {
          console.warn('rd', e);
          if (rdRun.current === run) setRd({ status: 'error' });
        });
    },
    [session, pack, areaHa],
  );

  const addPhoto = useCallback((p: FlowPhoto) => setPhotos((prev) => [...prev, p]), []);
  const setAnswers = useCallback((h: boolean, tr: boolean) => {
    setHeavyRain(h);
    setTreated(tr);
  }, []);
  const saveCurrentCase = useCallback(
    async (override?: { choice?: Choice }) => {
      if (!session || !pack) return;
      const id = idRef.current ?? caseId ?? crypto.randomUUID();
      idRef.current = id;
      setCaseId(id);
      const ch = override?.choice ?? choice ?? undefined;
      const c: Case = {
        id,
        date: savedCase?.date ?? new Date().toISOString(),
        packId: pack.id,
        session,
        ...(risk ? { risk } : {}),
        ...(decision ? { decision } : {}),
        ...(ch ? { choice: ch } : {}),
        ...(rd.status === 'ready' && rd.result ? { rd: summarize(rd.result) } : {}),
        sent: savedCase?.sent ?? false,
      };
      await saveCase(c);
      setSavedCase(c);
    },
    [session, pack, caseId, choice, risk, decision, savedCase, rd],
  );

  const value = useMemo<FlowCtx>(
    () => ({
      card, segCard, cardError, reloadCard, photos, session, heavyRain, treated, risk, decision, choice, caseId, savedCase, rd, startRd,
      startReview, addPhoto, setSession: setNewSession, setAnswers, setRisk, setDecision, setChoice, saveCurrentCase, setSavedCase,
    }),
    [card, segCard, cardError, reloadCard, photos, session, heavyRain, treated, risk, decision, choice, caseId, savedCase, rd, startRd, startReview, addPhoto, setNewSession, setAnswers, saveCurrentCase],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlow(): FlowCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFlow fuera de FlowProvider');
  return c;
}
