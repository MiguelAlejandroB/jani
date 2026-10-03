import { useNav } from '../nav';
import { t } from '../packs/active';
import { BigButton, Screen } from '../ui';

export default function Confirmacion() {
  const { go } = useNav();
  return (
    <Screen id="confirmacion" icon="✅" title={t('saved')}>
      <BigButton icon="⌂" onClick={() => go('inicio')} />
    </Screen>
  );
}
