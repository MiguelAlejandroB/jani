import { useNav } from '../nav';
import { t } from '../packs/active';
import { BigButton, Screen } from '../ui';

export default function Preguntas() {
  const { go } = useNav();
  return (
    <Screen id="preguntas" icon="🌧️" title={t('ask_rain')}>
      <p className="question">{t('ask_treatment')}</p>
      <BigButton icon="➜" onClick={() => go('riesgo')} />
    </Screen>
  );
}
