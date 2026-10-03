import { useNav } from '../nav';
import { BigButton, Screen } from '../ui';

export default function Diagnostico() {
  const { go } = useNav();
  return (
    <Screen id="diagnostico" icon="🔍">
      <BigButton icon="➜" onClick={() => go('preguntas')} />
    </Screen>
  );
}
