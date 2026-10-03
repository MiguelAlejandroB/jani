import type { ComponentType } from 'react';
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
  const { screen } = useNav();
  const Component = SCREEN_COMPONENTS[screen];
  return <Component />;
}

export default function App() {
  return (
    <NavProvider>
      <CurrentScreen />
    </NavProvider>
  );
}
