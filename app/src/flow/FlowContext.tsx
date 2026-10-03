import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadModelCard, type ModelCard } from '../engine/modelCard';
import { resetSim } from '../engine/see';
import { usePack } from '../packs/PackContext';
import { saveCase } from '../store/cases';
import type { Case, Choice, DecideResult, PredictResult, SeeResult, Session } from '../engine/types';

export type FlowPhoto = { url: string; result: SeeResult };

type FlowCtx = {
  card: ModelCard | null;
  photos: FlowPhoto[];
  session: Session | null;
  heavyRain: boolean | null;
  treated: boolean | null;
  risk: PredictResult | null;
  decision: DecideResult | null;
  choice: Choice | null;
  caseId: string | null;
  savedCase: Case | null;
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
  const { pack } = usePack();
  const [card, setCard] = useState<ModelCard | null>(null);
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
      .then((c) => alive && setCard(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
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
    idRef.current = null;
    resetSim();
  }, []);

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
        sent: savedCase?.sent ?? false,
      };
      await saveCase(c);
      setSavedCase(c);
    },
    [session, pack, caseId, choice, risk, decision, savedCase],
  );

  const value = useMemo<FlowCtx>(
    () => ({
      card, photos, session, heavyRain, treated, risk, decision, choice, caseId, savedCase,
      startReview, addPhoto, setSession, setAnswers, setRisk, setDecision, setChoice, saveCurrentCase, setSavedCase,
    }),
    [card, photos, session, heavyRain, treated, risk, decision, choice, caseId, savedCase, startReview, addPhoto, setAnswers, saveCurrentCase],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlow(): FlowCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFlow fuera de FlowProvider');
  return c;
}
