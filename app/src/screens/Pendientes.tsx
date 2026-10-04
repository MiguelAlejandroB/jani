import { useEffect, useState } from 'react';
import { outcomeKey } from '../engine/sms';
import { sessionOutcome } from '../engine/session';
import type { Case } from '../engine/types';
import { usePack } from '../packs/PackContext';
import type { Pack } from '../packs/schema';
import { listCases } from '../store/cases';
import { Icon } from '../icons';
import { Pill, Screen } from '../ui';

const RISK_COLOR = { LOW: 'var(--cherry-green)', MEDIUM: 'var(--cherry-pinton)', HIGH: 'var(--cherry-red)' } as const;

/** Badge del caso como en "Recent scans": la clase dominante (clay), sana (leaf) o dudosa (neutro). */
function badgeOf(c: Case, pack: Pack | null, t: (k: string) => string): { tone: 'clay' | 'leaf' | 'neutral'; text: string } {
  const o = sessionOutcome(c.session);
  if (o === 'consult') return { tone: 'neutral', text: t('unclear') };
  if (o === 'healthy') return { tone: 'leaf', text: pack?.classes.sana.label ?? '' };
  return { tone: 'clay', text: (c.session.dominant && pack?.classes[c.session.dominant].label) || '' };
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
    <Screen id="pendientes" icon="cases" eyebrow={t('app_name')} title={t('pending')}>
      {(cases ?? []).map((c) => {
        const badge = badgeOf(c, pack, t);
        return (
          <article className="card case fade-rise" key={c.id} data-testid="case-item">
            <div className="case-top">
              <span className="case-date">
                <Icon name="calendar" size={16} />
                {new Date(c.date).toLocaleDateString(locale)}
                {c.risk && c.risk.level !== 'CONSULT' && (
                  <span className="case-risk" data-testid="case-risk" data-level={c.risk.level} style={{ background: RISK_COLOR[c.risk.level] }} aria-hidden="true" />
                )}
              </span>
              <span className="case-badges">
                {badge.text && <Pill tone={badge.tone}>{badge.text}</Pill>}
                {c.sent && (
                  <Pill tone="leaf" icon="message" testId="case-sent">
                    {t('sent')}
                  </Pill>
                )}
              </span>
            </div>
            <p className="case-outcome">{t(outcomeKey(c))}</p>
            {c.choice && (
              <p className="case-choice">
                <Icon name="check" size={16} />
                {t(`opt_${c.choice.toLowerCase()}`)}
              </p>
            )}
          </article>
        );
      })}
    </Screen>
  );
}
