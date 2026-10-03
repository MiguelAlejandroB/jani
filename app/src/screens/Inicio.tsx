import { useNav } from '../nav';
import { t } from '../packs/active';
import { BigButton, Screen } from '../ui';

export default function Inicio() {
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
