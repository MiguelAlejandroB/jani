import { t } from '../packs/active';
import { Screen } from '../ui';

export default function Pendientes() {
  return <Screen id="pendientes" icon="📋" title={t('pending')} />;
}
