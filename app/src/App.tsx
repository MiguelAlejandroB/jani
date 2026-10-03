import { useEffect, type ComponentType } from 'react';
import { PackProvider, usePack } from './packs/PackContext';
import { NavProvider, useNav, type ScreenId } from './nav';
import Inicio from './screens/Inicio';
import Captura from './screens/Captura';
import Diagnostico from './screens/Diagnostico';
import Preguntas from './screens/Preguntas';
import Riesgo from './screens/Riesgo';
import Decision from './screens/Decision';
import Confirmacion from './screens/Confirmacion';
import Pendientes from './screens/Pendientes';
import Paquetes from './screens/Paquetes';
import AcercaDe from './screens/AcercaDe';

const SCREEN_COMPONENTS: Record<ScreenId, ComponentType> = {
  inicio: Inicio,
  captura: Captura,
  diagnostico: Diagnostico,
  preguntas: Preguntas,
  riesgo: Riesgo,
  decision: Decision,
  confirmacion: Confirmacion,
  pendientes: Pendientes,
  paquetes: Paquetes,
  acerca: AcercaDe,
};

function CurrentScreen() {
  const { screen, go } = useNav();
  const { pack, ready } = usePack();
  const mustInstall = ready && !pack;
  useEffect(() => {
    if (mustInstall && screen !== 'paquetes') go('paquetes');
  }, [mustInstall, screen, go]);
  if (!ready) return null;
  const Component = SCREEN_COMPONENTS[mustInstall ? 'paquetes' : screen];
  return <Component />;
}

export default function App() {
  return (
    <PackProvider>
      <NavProvider>
        <CurrentScreen />
      </NavProvider>
    </PackProvider>
  );
}
