import type { ReactNode } from 'react';
import { useNav, type ScreenId } from './nav';

// Botón grande con ícono; el texto, si lo hay, viene del paquete.
export function BigButton(props: {
  icon: string;
  label?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  testId?: string;
}) {
  return (
    <button className={`big-btn ${props.variant ?? 'primary'}`} onClick={props.onClick} data-testid={props.testId} aria-label={props.label || props.icon}>
      <span className="big-btn-icon" aria-hidden="true">
        {props.icon}
      </span>
      {props.label && <span className="big-btn-label">{props.label}</span>}
    </button>
  );
}

// Marco común: volver / inicio, ícono de la pantalla, título y contenido.
export function Screen(props: { id: ScreenId; icon: string; title?: string; children?: ReactNode }) {
  const { go, back } = useNav();
  return (
    <main className="screen" data-screen={props.id}>
      {props.id !== 'inicio' && (
        <nav className="topbar">
          <button className="icon-btn" onClick={back} aria-label="←">
            ←
          </button>
          <button className="icon-btn" onClick={() => go('inicio')} aria-label="⌂">
            ⌂
          </button>
        </nav>
      )}
      <div className="screen-icon" aria-hidden="true">
        {props.icon}
      </div>
      {props.title && <h1 className="screen-title">{props.title}</h1>}
      <div className="screen-body">{props.children}</div>
    </main>
  );
}
