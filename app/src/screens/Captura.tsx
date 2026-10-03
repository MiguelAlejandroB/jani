import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

export default function Captura() {
  const { t } = usePack();
  const { go } = useNav();
  return (
    <Screen id="captura" icon="📷" title={t('more_photos')}>
      <BigButton icon="✅" label={t('done_photos')} onClick={() => go('diagnostico')} />
    </Screen>
  );
}
