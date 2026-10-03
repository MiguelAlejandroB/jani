import { useEffect, useState } from 'react';
import { outcomeKey } from '../engine/sms';
import { sessionOutcome } from '../engine/session';
import type { Case } from '../engine/types';
import { usePack } from '../packs/PackContext';
import { listCases } from '../store/cases';
import { Screen } from '../ui';

const RISK_COLOR = { LOW: '#2e9e4f', MEDIUM: '#e0a800', HIGH: '#d32f2f' } as const;

function outcomeIcon(c: Case): string {
  const o = sessionOutcome(c.session);
  return o === 'consult' ? '❓' : o === 'healthy' ? '✅' : '🍂';
}

export default function Pendientes() {
  const { t, pack } = usePack();
  const [cases, setCases] = useState<Case[] | null>(null);
  useEffect(() => {
    let alive = true;
    listCases()
      .then((l) => alive && setCases(l))
      .catch(() => alive && setCases([]));
    return () => {
      alive = false;
    };
  }, []);
  const locale = pack?.language.code;
  return (
    <Screen id="pendientes" icon="📋" title={t('pending')}>
      {(cases ?? []).map((c) => (
        <div className="kpi" key={c.id} data-testid="case-item">
          <span className="kpi-icon" aria-hidden="true">
            {outcomeIcon(c)}
          </span>
          <span className="kpi-label">
            {new Date(c.date).toLocaleDateString(locale)}
            <br />
            {t(outcomeKey(c))}
            {c.choice && (
              <>
                <br />
                {t(`opt_${c.choice.toLowerCase()}`)}
              </>
            )}
          </span>
          {c.risk && c.risk.level !== 'CONSULT' && (
            <span
              className="kpi-value"
              data-testid="case-risk"
              data-level={c.risk.level}
              style={{ color: RISK_COLOR[c.risk.level] }}
              aria-hidden="true"
            >
              ●
            </span>
          )}
          {c.sent && <span aria-hidden="true">📨</span>}
        </div>
      ))}
    </Screen>
  );
}
