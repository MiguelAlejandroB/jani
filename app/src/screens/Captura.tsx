import { useNav } from '../nav';
import { t } from '../packs/active';
import { BigButton, Screen } from '../ui';

export default function Captura() {
  const { go } = useNav();
  return (
    <Screen id="captura" icon="📷" title={t('more_photos')}>
      <BigButton icon="✅" label={t('done_photos')} onClick={() => go('diagnostico')} />
    </Screen>
  );
}
