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
    <button className={`big-btn ${props.variant ?? 'primary'}`} onClick={props.onClick} data-testid={props.testId} disabled={props.disabled} data-suggested={props.suggested ? 'true' : undefined} aria-label={props.label || props.icon}>
      <span className="big-btn-icon" aria-hidden="true">
        {props.icon}
      </span>
      {props.label && <span className="big-btn-label">{props.label}</span>}
    </button>
  );
}

// Marco común: volver / inicio, ícono de la pantalla, título y contenido.
// `top`: el contenido arranca arriba (pantallas largas); por defecto queda abajo, cerca del pulgar.
export function Screen(props: { id: ScreenId; icon: string; title?: string; children?: ReactNode; onIconClick?: () => void; audio?: string[]; audioNonce?: number; top?: boolean }) {
  const { go, back } = useNav();
  const repeat = useScreenAudio(props.audio ?? [], props.audioNonce ?? 0);
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
      {props.icon && (
        <div className="screen-icon" aria-hidden="true" data-testid="screen-icon" onClick={props.onIconClick}>
          {props.icon}
        </div>
      )}
      {props.title && <h1 className="screen-title">{props.title}</h1>}
      <div className={`screen-body${props.top ? ' top' : ''}`}>{props.children}</div>
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

// ---------- Riesgo y decisión ----------

export type GaugeLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONSULT';
const STAGES: ReadonlyArray<{ level: GaugeLevel; color: string }> = [
  { level: 'LOW', color: 'var(--green-cherry)' },
  { level: 'MEDIUM', color: 'var(--pinton)' },
  { level: 'HIGH', color: 'var(--cherry)' },
];

// Una cereza de café con pedúnculo y hoja. `mark` dibuja un "?" (nivel desconocido).
function Cherry({ color, size, mark, className }: { color: string; size: number; mark?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size * 1.1} viewBox="0 0 100 110" aria-hidden="true">
      <path d="M50 34 C50 22 54 12 62 5" fill="none" stroke="#4E3A1E" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 8 C72 -2 92 2 96 10 C86 20 68 20 60 8 Z" fill="#2F6B34" />
      <path d="M61 8 C72 6 84 8 94 10" fill="none" stroke="#1F4D2B" strokeWidth="1.5" />
      <ellipse className="cherry-fill" cx="50" cy="70" rx="36" ry="36" style={{ fill: color }} />
      <ellipse cx="36" cy="56" rx="9" ry="12" fill="#fff" opacity="0.28" transform="rotate(-25 36 56)" />
      <circle cx="50" cy="102" r="3.5" fill="rgb(0 0 0 / .25)" />
      {mark && (
        <text x="50" y="84" textAnchor="middle" fontSize="44" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
          ?
        </text>
      )}
    </svg>
  );
}

/** La cereza que madura: verde (bajo), pintona (medio), roja (alto) o gris con "?" (consultar). `ripening`: calculando. */
export function CherryGauge({ level, label, ripening }: { level: GaugeLevel; label: string; ripening?: boolean }) {
  const big = 112;
  const small = 40;
  const active = ripening ? null : level;
  return (
    <div className={`gauge${ripening ? ' ripening' : ''}`} role="img" aria-label={label} data-testid="risk-level" data-level={ripening ? undefined : level}>
      {ripening || level === 'CONSULT' ? (
        <>
          <Cherry className="stage" color={STAGES[0]!.color} size={small} />
          <Cherry color={ripening ? STAGES[0]!.color : '#9AA39C'} size={big} mark={!ripening} />
          <Cherry className="stage" color={STAGES[2]!.color} size={small} />
        </>
      ) : (
        STAGES.map((s) => (
          <Cherry key={s.level} className={s.level === active ? undefined : 'stage'} color={s.color} size={s.level === active ? big : small} />
        ))
      )}
    </div>
  );
}

/** N de 10 puntos (●○). */
export function Dots({ n, tone }: { n: number; tone?: 'loss' | 'good' }) {
  return (
    <span className={`dots${tone ? ` ${tone}` : ''}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`dot${i < n ? ' on' : ''}`} />
      ))}
    </span>
  );
}

/** Banda P10–P90 sobre una pista min..max, marca gruesa en P50 y punteada en "año malo". Con `min < 0`, línea del cero. */
export function RangeBar(props: { min?: number; max: number; p10: number; p50: number; p90: number; bad?: number; tone?: 'loss' | 'gain' }) {
  const min = props.min ?? 0;
  const span = props.max - min || 1;
  const x = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const band = props.tone === 'gain' ? 'var(--green-cherry)' : 'var(--cherry)';
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="15" width="100" height="10" rx="5" style={{ fill: 'var(--underleaf)' }} />
      <rect x={x(props.p10)} y="15" width={Math.max(x(props.p90) - x(props.p10), 1)} height="10" opacity="0.45" style={{ fill: band }} />
      {min < 0 && <line x1={x(0)} x2={x(0)} y1="6" y2="34" strokeWidth="1.5" style={{ stroke: 'var(--muted)' }} vectorEffect="non-scaling-stroke" />}
      {props.bad !== undefined && (
        <line x1={x(props.bad)} x2={x(props.bad)} y1="3" y2="37" strokeWidth="2.5" style={{ stroke: 'var(--cherry)' }} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      )}
      <line x1={x(props.p50)} x2={x(props.p50)} y1="8" y2="32" strokeWidth="5" style={{ stroke: 'var(--ink)' }} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
