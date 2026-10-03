import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadModelCard, type ModelCard } from '../engine/modelCard';
import { resetSim } from '../engine/see';
import type { Choice, DecideResult, PredictResult, SeeResult, Session } from '../engine/types';

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
  startReview: () => void;
  addPhoto: (p: FlowPhoto) => void;
  setSession: (s: Session) => void;
  setAnswers: (heavyRain: boolean, treated: boolean) => void;
  setRisk: (r: PredictResult | null) => void;
  setDecision: (d: DecideResult) => void;
  setChoice: (c: Choice) => void;
  /** Punto de enganche para Task 7 (persistencia en IndexedDB). Por ahora solo asegura un caseId. */
  saveCurrentCase: (override?: { choice?: Choice }) => void;
};

const Ctx = createContext<FlowCtx | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [photos, setPhotos] = useState<FlowPhoto[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [heavyRain, setHeavyRain] = useState<boolean | null>(null);
  const [treated, setTreated] = useState<boolean | null>(null);
  const [risk, setRisk] = useState<PredictResult | null>(null);
  const [decision, setDecision] = useState<DecideResult | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);

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
    resetSim();
  }, []);

  const addPhoto = useCallback((p: FlowPhoto) => setPhotos((prev) => [...prev, p]), []);
  const setAnswers = useCallback((h: boolean, tr: boolean) => {
    setHeavyRain(h);
    setTreated(tr);
  }, []);
  const saveCurrentCase = useCallback(() => {
    setCaseId((id) => id ?? crypto.randomUUID());
  }, []);

  const value = useMemo<FlowCtx>(
    () => ({
      card, photos, session, heavyRain, treated, risk, decision, choice, caseId,
      startReview, addPhoto, setSession, setAnswers, setRisk, setDecision, setChoice, saveCurrentCase,
    }),
    [card, photos, session, heavyRain, treated, risk, decision, choice, caseId, startReview, addPhoto, setAnswers, saveCurrentCase],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlow(): FlowCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFlow fuera de FlowProvider');
  return c;
}
