import { usePack } from '../packs/PackContext';
import { Screen } from '../ui';

export default function Pendientes() {
  const { t } = usePack();
  return <Screen id="pendientes" icon="📋" title={t('pending')} />;
}
