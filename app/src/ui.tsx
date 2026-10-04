import type { ReactNode } from 'react';
import { useNav, type ScreenId } from './nav';
import { useScreenAudio } from './flow/useScreenAudio';
import { usePack } from './packs/PackContext';
import { BrandMark, Icon, isIconName, type IconName } from './icons';

/** Ícono del juego propio si el nombre existe; si no, el texto tal cual (p. ej. un ícono que viene del paquete). */
export function Glyph({ name, size = 24 }: { name: string; size?: number }) {
  return isIconName(name) ? <Icon name={name} size={size} /> : <span className="glyph-text">{name}</span>;
}

// Botón grande con ícono; el texto, si lo hay, viene del paquete.
// primary: clay (la acción principal de la pantalla). secondary: contorno. ghost: solo texto (acción secundaria del pie).
export function BigButton(props: {
  icon: IconName;
  label?: string;
  /** Nombre accesible si el botón no tiene texto. */
  ariaLabel?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  testId?: string;
  disabled?: boolean;
  suggested?: boolean;
}) {
  return (
    <button
      className={`big-btn ${props.variant ?? 'primary'}`}
      onClick={props.onClick}
      data-testid={props.testId}
      disabled={props.disabled}
      data-suggested={props.suggested ? 'true' : undefined}
      aria-label={props.label || props.ariaLabel || props.icon}
    >
      <Icon name={props.icon} size={26} className="big-btn-icon" />
      {props.label && <span className="big-btn-label">{props.label}</span>}
    </button>
  );
}

/** Pastilla de estado (chips del encabezado, badges de diagnóstico). */
export function Pill(props: { tone?: 'clay' | 'leaf' | 'neutral' | 'sun'; icon?: IconName; dot?: boolean; children?: ReactNode; testId?: string }) {
  return (
    <span className={`pill ${props.tone ?? 'neutral'}`} data-testid={props.testId}>
      {props.dot && <span className="pill-dot" aria-hidden="true" />}
      {props.icon && <Icon name={props.icon} size={15} />}
      {props.children}
    </span>
  );
}

/** Antetítulo: mayúsculas pequeñas y espaciadas, color mist. */
export function Eyebrow({ children, tone }: { children: ReactNode; tone?: 'leaf' | 'clay' }) {
  return <p className={`eyebrow${tone ? ` ${tone}` : ''}`}>{children}</p>;
}

const TABS: ReadonlyArray<{ id: ScreenId; icon: IconName; key: string }> = [
  { id: 'inicio', icon: 'home', key: 'home' },
  { id: 'pendientes', icon: 'cases', key: 'pending' },
  { id: 'paquetes', icon: 'box', key: 'packs' },
  { id: 'acerca', icon: 'info', key: 'about' },
];

/** Barra de pestañas de las pantallas de primer nivel. */
export function TabBar({ current }: { current: ScreenId }) {
  const { go } = useNav();
  const { t } = usePack();
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button key={tab.id} className="tab" aria-current={tab.id === current ? 'page' : undefined} onClick={() => go(tab.id)} data-testid={`tab-${tab.id}`}>
          <Icon name={tab.icon} size={24} />
          <span className="tab-label">{t(tab.key)}</span>
        </button>
      ))}
    </nav>
  );
}

const TOP_LEVEL: ReadonlySet<ScreenId> = new Set<ScreenId>(['inicio', 'pendientes', 'paquetes', 'acerca']);

// Marco común: barra (volver / inicio y audio), ícono + antetítulo + título, chips, contenido, zona de acciones fija y,
// en las pantallas de primer nivel, la barra de pestañas.
export function Screen(props: {
  id: ScreenId;
  icon?: IconName;
  eyebrow?: string;
  title?: string;
  chips?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onIconClick?: () => void;
  audio?: string[];
  audioNonce?: number;
}) {
  const { go, back } = useNav();
  const { t } = usePack();
  const repeat = useScreenAudio(props.audio ?? [], props.audioNonce ?? 0);
  const home = props.id === 'inicio';
  const tabs = TOP_LEVEL.has(props.id);
  const hasAudio = !!props.audio && props.audio.length > 0;
  return (
    <main className="screen" data-screen={props.id}>
      <header className="hdr">
        <div className="hdr-bar">
          {home ? (
            <div className="brand">
              <span data-testid="screen-icon" onClick={props.onIconClick}>
                <BrandMark size={40} />
              </span>
              <span className="brand-name">
                {t('app_name')}
                <span className="brand-dot" aria-hidden="true">
                  .
                </span>
              </span>
            </div>
          ) : (
            <nav className="hdr-nav">
              <button className="round-btn" onClick={back} aria-label="←" title={t('back')}>
                <Icon name="chevron-left" />
              </button>
              <button className="round-btn" onClick={() => go('inicio')} aria-label="⌂" title={t('go_home')}>
                <Icon name="home" />
              </button>
            </nav>
          )}
          {hasAudio && <RepeatButton onClick={repeat} />}
        </div>
        {(props.title || props.eyebrow || props.icon) && (
          <div className="hdr-main">
            {props.icon && (
              <span className="hdr-icon" aria-hidden="true" data-testid="screen-icon" onClick={props.onIconClick}>
                <Icon name={props.icon} size={24} />
              </span>
            )}
            <div className="hdr-text">
              {props.eyebrow && <Eyebrow>{props.eyebrow}</Eyebrow>}
              {props.title && <h1 className="title">{props.title}</h1>}
            </div>
          </div>
        )}
        {props.chips && <div className="chips-row">{props.chips}</div>}
      </header>
      <div className="screen-body">{props.children}</div>
      {(props.actions || tabs) && (
        <div className="dock">
          {props.actions && <div className="actions">{props.actions}</div>}
          {tabs && <TabBar current={props.id} />}
        </div>
      )}
    </main>
  );
}

// Etiqueta de datos de demostración (criterio 6).
export function DemoBadge({ text }: { text: string }) {
  return (
    <span className="pill sun demo-badge" data-testid="demo-badge">
      <Icon name="flask" size={15} />
      {text}
    </span>
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

// Botón redondo para repetir el audio de la pantalla.
export function RepeatButton({ onClick }: { onClick: () => void }) {
  const { t } = usePack();
  return (
    <button className="round-btn" data-testid="repeat-audio" onClick={onClick} aria-label={t('listen') || '🔊'}>
      <Icon name="speaker" />
    </button>
  );
}

/** Barra de proporción que crece al aparecer. */
export function Bar({ value, tone }: { value: number; tone: 'clay' | 'leaf' | 'neutral' }) {
  return (
    <div className="bar">
      <div className={`bar-fill bar-grow ${tone}`} style={{ width: `${Math.max(2, Math.round(value * 100))}%` }} />
    </div>
  );
}

// ---------- Riesgo y decisión ----------

export type GaugeLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONSULT';
const STAGES: ReadonlyArray<{ level: GaugeLevel; color: string }> = [
  { level: 'LOW', color: 'var(--cherry-green)' },
  { level: 'MEDIUM', color: 'var(--cherry-pinton)' },
  { level: 'HIGH', color: 'var(--cherry-red)' },
];

// Una cereza de café con pedúnculo y hoja. `mark` dibuja un "?" (nivel desconocido).
function Cherry({ color, size, mark, className }: { color: string; size: number; mark?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size * 1.1} viewBox="0 0 100 110" aria-hidden="true">
      <path d="M50 34 C50 22 54 12 62 5" fill="none" stroke="#5A4128" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 8 C72 -2 92 2 96 10 C86 20 68 20 60 8 Z" style={{ fill: 'var(--leaf)' }} />
      <path d="M61 8 C72 6 84 8 94 10" fill="none" stroke="#3F5A3B" strokeWidth="1.5" />
      <ellipse className="cherry-fill" cx="50" cy="70" rx="36" ry="36" style={{ fill: color }} />
      <ellipse cx="36" cy="56" rx="9" ry="12" fill="#fff" opacity="0.28" transform="rotate(-25 36 56)" />
      <circle cx="50" cy="102" r="3.5" fill="rgb(58 42 28 / .2)" />
      {mark && (
        <text x="50" y="84" textAnchor="middle" fontSize="44" fontWeight="600" fill="#fff" fontFamily="Fraunces, Georgia, serif">
          ?
        </text>
      )}
    </svg>
  );
}

/** La cereza que madura: verde (bajo), pintona (medio), roja (alto) o gris con "?" (consultar). `ripening`: calculando. */
export function CherryGauge({ level, label, ripening }: { level: GaugeLevel; label: string; ripening?: boolean }) {
  const big = 104;
  const small = 36;
  const active = ripening ? null : level;
  return (
    <div className={`gauge${ripening ? ' ripening' : ''}`} role="img" aria-label={label} data-testid="risk-level" data-level={ripening ? undefined : level}>
      {ripening || level === 'CONSULT' ? (
        <>
          <Cherry className="stage" color={STAGES[0]!.color} size={small} />
          <Cherry color={ripening ? STAGES[0]!.color : 'var(--consult)'} size={big} mark={!ripening} />
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

/** N de 10 puntos. */
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
  const band = props.tone === 'gain' ? 'var(--leaf)' : 'var(--clay)';
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="15" width="100" height="10" rx="5" style={{ fill: 'var(--e10)' }} />
      <rect x={x(props.p10)} y="15" width={Math.max(x(props.p90) - x(props.p10), 1)} height="10" rx="3" opacity="0.55" style={{ fill: band }} />
      {min < 0 && <line x1={x(0)} x2={x(0)} y1="6" y2="34" strokeWidth="1.5" style={{ stroke: 'var(--mist)' }} vectorEffect="non-scaling-stroke" />}
      {props.bad !== undefined && (
        <line x1={x(props.bad)} x2={x(props.bad)} y1="3" y2="37" strokeWidth="2.5" style={{ stroke: 'var(--clay-ink)' }} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      )}
      <line x1={x(props.p50)} x2={x(props.p50)} y1="8" y2="32" strokeWidth="5" style={{ stroke: 'var(--espresso)' }} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
