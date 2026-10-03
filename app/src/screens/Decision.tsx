import { useNav } from '../nav';
import { t } from '../packs/active';
import { BigButton, Screen } from '../ui';

export default function Decision() {
  const { go } = useNav();
  return (
    <Screen id="decision" icon="⚖️" title={t('you_decide')}>
      <BigButton icon="⏳" label={t('opt_wait')} onClick={() => go('confirmacion')} />
      <BigButton icon="💧" label={t('opt_treat')} onClick={() => go('confirmacion')} />
      <BigButton icon="🧑‍🌾" label={t('opt_consult')} onClick={() => go('confirmacion')} />
    </Screen>
  );
}
