import { useNav } from '../nav';
import { BigButton, Screen } from '../ui';

export default function Riesgo() {
  const { go } = useNav();
  return (
    <Screen id="riesgo" icon="🚦">
      <BigButton icon="➜" onClick={() => go('decision')} />
    </Screen>
  );
}
