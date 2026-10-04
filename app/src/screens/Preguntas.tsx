import { useState } from 'react';
import { predict } from '../engine/predict';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Preguntas() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { session, setAnswers, setRisk, startRd } = useFlow();
  const [rain, setRain] = useState<boolean | null>(null);
  useRedirectIf(session === null || session.dominant === null || pack === null);
  if (!session || session.dominant === null || !pack) return null;
  const dominant = session.dominant;

  const answer = (value: boolean) => {
    if (rain === null) {
      setRain(value);
      return;
    }
    setAnswers(rain, value);
    startRd(rain); // RIESGO + DECISIÓN del manual, en segundo plano; las pantallas lo muestran cuando está listo
    setRisk(
      predict(
        {
          dominant,
          affectedShare: session.affectedShare,
          month: new Date().getMonth() + 1,
          heavyRainThisWeek: rain,
          treatedLast60Days: value,
        },
        pack,
      ),
    );
    go('riesgo');
  };

  return (
    <Screen id="preguntas" icon={rain === null ? '🌧️' : '💧'} title={t(rain === null ? 'ask_rain' : 'ask_treatment')} audio={[rain === null ? 'ask_rain' : 'ask_treatment']}>
      <div className="answer-row">
        <BigButton icon="👍" label={t('yes')} testId="answer-yes" onClick={() => answer(true)} />
        <BigButton icon="👎" label={t('no')} testId="answer-no" variant="secondary" onClick={() => answer(false)} />
      </div>
    </Screen>
  );
}
