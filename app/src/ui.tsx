import type { ReactNode } from 'react';
import { useNav, type ScreenId } from './nav';
import { useScreenAudio } from './flow/useScreenAudio';

// Botón grande con ícono; el texto, si lo hay, viene del paquete.
export function BigButton(props: {
  icon: string;
  label?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  testId?: string;
  disabled?: boolean;
  suggested?: boolean;
}) {
  return (
    <button className={`big-btn ${props.variant ?? 'primary'}`} onClick={props.onClick} data-testid={props.testId} disabled={props.disabled} data-suggested={props.suggested ? 'true' : undefined}aria-label={props.label || props.icon}>
      <span className="big-btn-icon" aria-hidden="true">
        {props.icon}
      </span>
      {props.label && <span className="big-btn-label">{props.label}</span>}
    </button>
  );
}

// Marco común: volver / inicio, ícono de la pantalla, título y contenido.
export function Screen(props: { id: ScreenId; icon: string; title?: string; children?: ReactNode; onIconClick?: () => void; audio?: string[] }) {
  const { go, back } = useNav();
  const repeat = useScreenAudio(props.audio ?? []);
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
      <div className="screen-icon" aria-hidden="true" data-testid="screen-icon" onClick={props.onIconClick}>
        {props.icon}
      </div>
      {props.title && <h1 className="screen-title">{props.title}</h1>}
      <div className="screen-body">{props.children}</div>
      {props.audio && props.audio.length > 0 && <RepeatButton onClick={repeat} />}
    </main>
  );
}

// Etiqueta de datos de demostración (criterio 6).
export function DemoBadge({ text }: { text: string }) {
  return (
    <div className="demo-badge" data-testid="demo-badge">
      🧪 {text}
    </div>
  );
}

// Aviso de que el caso no se pudo guardar (solo ícono); la persona puede volver a tocar el botón.
export function SaveError() {
  return (
    <div className="pack-error" data-testid="save-error">
      <div className="pack-error-icon">⚠️</div>
    </div>
  );
}

// Botón grande para repetir el audio de la pantalla.
export function RepeatButton({ onClick }: { onClick: () => void }) {
  return <BigButton icon="🔊" variant="secondary" testId="repeat-audio" onClick={onClick} />;
}
