import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Inicio() {
  const { t } = usePack();
  const { go } = useNav();
  return (
    <Screen id="inicio" icon="☕" title={t('welcome')}>
      <BigButton icon="📷" onClick={() => go('captura')} />
      <BigButton icon="📋" label={t('pending')} variant="secondary" onClick={() => go('pendientes')} />
      <BigButton icon="📦" label={t('packs')} variant="secondary" onClick={() => go('paquetes')} />
      <BigButton icon="ℹ️" variant="secondary" onClick={() => go('acerca')} />
    </Screen>
  );
}
