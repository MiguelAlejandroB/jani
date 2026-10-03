import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Confirmacion() {
  const { t } = usePack();
  const { go } = useNav();
  return (
    <Screen id="confirmacion" icon="✅" title={t('saved')} audio={['saved']}>
      <BigButton icon="⌂" onClick={() => go('inicio')} />
    </Screen>
  );
}
