import type { ReactNode } from 'react';
import { sessionOutcome } from '../engine/session';
import type { DecideResult, SeeResult } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

const CONSULT_DECISION: DecideResult = { suggestion: 'CONSULT', phrase: 'consult', usedDemoData: false };

function iconFor(r: SeeResult): string {
  if (r.status === 'unsure') return '❓';
  return r.classId === 'sana' ? '✅' : '🍂';
}

export default function Diagnostico() {
  const { t } = usePack();
  const { go } = useNav();
  const { session, photos, setRisk, setDecision, saveCurrentCase } = useFlow();
  useRedirectIf(session === null);
  if (!session) return null;

  const outcome = sessionOutcome(session);

  let text: string;
  let button: ReactNode;
  if (outcome === 'consult') {
    text = t('unsure');
    button = (
      <BigButton
        icon="➜"
        testId="dx-next"
        onClick={() => {
          setRisk(null);
          setDecision(CONSULT_DECISION);
          go('decision');
        }}
      />
    );
  } else if (outcome === 'healthy') {
    text = t('all_healthy');
    button = (
      <BigButton
        icon="✅"
        testId="dx-next"
        onClick={() => {
          void saveCurrentCase().then(() => go('confirmacion'));
        }}
      />
    );
  } else {
    text = session.dominant ? t(`dx_${session.dominant}`) : '';
    button = <BigButton icon="➜" testId="dx-next" onClick={() => go('preguntas')} />;
  }

  return (
    <Screen id="diagnostico" icon="🔍" audio={[outcome === 'consult' ? 'unsure' : outcome === 'healthy' ? 'all_healthy' : session.dominant ? `dx_${session.dominant}` : 'unsure']}>
      <div className="thumbs">
        {photos.map((p) => (
          <div className="thumb" key={p.url}>
            <img src={p.url} alt="" />
            <span className="thumb-badge">{iconFor(p.result)}</span>
          </div>
        ))}
      </div>
      <p className="question" data-testid="dx-outcome" data-outcome={outcome}>
        {text}
      </p>
      {button}
    </Screen>
  );
}
