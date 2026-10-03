import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Preguntas() {
  const { t } = usePack();
  const { go } = useNav();
  return (
    <Screen id="preguntas" icon="🌧️" title={t('ask_rain')}>
      <p className="question">{t('ask_treatment')}</p>
      <BigButton icon="➜" onClick={() => go('riesgo')} />
    </Screen>
  );
}
