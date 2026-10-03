import { useNav } from '../nav';
import { useFlow } from '../flow/FlowContext';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Inicio() {
  const { t } = usePack();
  const { go } = useNav();
  const { startReview } = useFlow();
  return (
    <Screen id="inicio" icon="☕" title={t('welcome')} audio={['welcome']}>
      <BigButton
        icon="📷"
        testId="start-review"
        onClick={() => {
          startReview();
          go('captura');
        }}
      />
      <BigButton icon="📋" label={t('pending')} variant="secondary" onClick={() => go('pendientes')} />
      <BigButton icon="📦" label={t('packs')} variant="secondary" onClick={() => go('paquetes')} />
      <BigButton icon="ℹ️" variant="secondary" onClick={() => go('acerca')} />
    </Screen>
  );
}
