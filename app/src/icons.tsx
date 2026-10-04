// Juego de íconos propio: línea de 1.9 sobre una retícula de 24, puntas redondeadas, color = currentColor.
// Cada ícono es un solo `d` (los círculos se escriben como dos arcos) para que el juego completo pese poco.

const c = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const LEAF = 'M4.5 19.5C3.5 11 8.5 4.5 19.5 4.5c.5 10.5-5.5 16-15 15zM4.5 19.5 14 10';
const DROP = 'M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z';

const PATHS = {
  camera: `M3 8.5A2.5 2.5 0 0 1 5.5 6H7l1.5-2h7L17 6h1.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z${c(12, 13, 3.6)}`,
  leaf: LEAF,
  'leaf-check': 'M4 18.5C3 10.5 7.8 4.5 18 4.5c.2 3.4-.4 6.2-1.6 8.4M4 18.5c3 .4 5.6.1 7.7-.8M4 18.5l8.8-8.8M14 18l2.5 2.5L21 16',
  lens: `${c(11, 11, 6.5)}M20 20l-4.4-4.4`,
  rain: 'M6.5 14.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.7-1.2 4 4 0 0 1 1.7 8.2zM8 18l-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5',
  sun: `${c(12, 12, 4)}M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4`,
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  'arrow-right': 'M4.5 12h15M13.5 6l6 6-6 6',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  home: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  folder: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z',
  pin: `M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z${c(12, 10, 2.3)}`,
  cases: 'M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15M10 3h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8.5 11h7M8.5 15h5',
  info: `${c(12, 12, 9)}M12 11v5.5M12 7.6v.1`,
  message: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z',
  person: `${c(12, 9.5, 3)}M5 20.5c.8-3.6 3.6-5.8 7-5.8s6.2 2.2 7 5.8M6.5 6.5h11M9 6.5c.3-1.9 1.4-3 3-3s2.7 1.1 3 3`,
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  clock: `${c(12, 12, 9)}M12 7.5V12l3 2`,
  scissors: `${c(6.5, 6.5, 2.5)}${c(6.5, 17.5, 2.5)}M8.6 8 20 18M8.6 16 20 6`,
  drop: DROP,
  'drop-off': `${DROP}M4 4l16 16`,
  shield: 'M12 3 5 5.8v5.4c0 4.6 3 8.3 7 9.8 4-1.5 7-5.2 7-9.8V5.8z',
  sprout: 'M12 20.5V11M12 11C12 7 9 4.5 4.5 4.5 4.5 9 7.5 11 12 11zM12 13.5c0-3.5 2.5-6 7-6 0 4-2.5 6-7 6zM7 20.5h10',
  bug: 'M12 8a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0v-4a4 4 0 0 1 4-4zM12 8v12M9.5 8.5a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4M5 7.5l3 2M19 7.5l-3 2M5 19l3-2M19 19l-3-2',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  alert: 'M10.3 4.2 2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5V14M12 17v.1',
  globe: `${c(12, 12, 9)}M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z`,
  hectare: 'M3 19.5 7 4.5h10l4 15zM12 4.5v15M9.5 4.5 8 19.5M14.5 4.5l1.5 15',
  calendar: 'M6 5.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  box: 'M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  flask: 'M9.5 3.5h5M10.5 3.5v6L5 19a1.3 1.3 0 0 0 1.1 2h11.8A1.3 1.3 0 0 0 19 19l-5.5-9.5v-6M7.5 15h9',
  coins: `M9 5c3.3 0 6 1.1 6 2.5S12.3 10 9 10 3 8.9 3 7.5 5.7 5 9 5zM3 7.5v4C3 12.9 5.7 14 9 14s6-1.1 6-2.5M3 11.5v4C3 16.9 5.7 18 9 18c1.2 0 2.3-.1 3.2-.4${c(17, 15.5, 4)}`,
  scale: 'M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z',
  'trend-down': 'M3.5 7.5l6 6 4-4 7 7M20.5 11.5v5h-5',
  'trend-up': 'M3.5 16.5l6-6 4 4 7-7M20.5 12.5v-5h-5',
  tag: `M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1L21 11.9 12.9 20z${c(8, 8, 1.5)}`,
  ban: `${c(12, 12, 9)}M5.6 5.6l12.8 12.8`,
  question: `${c(12, 12, 9)}M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.1`,
} as const;

export type IconName = keyof typeof PATHS;

export const isIconName = (s: string): s is IconName => Object.prototype.hasOwnProperty.call(PATHS, s);

export function Icon({ name, size = 24, className, strokeWidth = 1.9 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Color del punto de cada estado de la hoja (miniaturas, listas). */
export const STATUS_COLOR: Record<string, string> = {
  sana: 'var(--green-cherry)',
  roya: 'var(--pinton)',
  minador: 'var(--roast)',
  phoma: 'var(--ink)',
  cercospora: 'var(--cherry)',
  unsure: '#8A948D',
};

/** Hoja con un punto de color: el ícono de cada enfermedad o estado. */
export function LeafStatus({ status, size = 24 }: { status: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="leaf">
      <path d={LEAF} />
      <circle cx="17.5" cy="17.5" r="4.5" stroke="var(--paper)" strokeWidth={2} style={{ fill: STATUS_COLOR[status] ?? STATUS_COLOR.unsure }} />
    </svg>
  );
}

/** Ícono de la app: hoja de café con nervio claro y una cereza en su pedúnculo, sobre un cuadrado verde hoja. */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#1F4D2B" />
      <path d="M10 46C8 28 20 11 46 10c1.5 23-12 37-36 36z" fill="#6E9B3A" />
      <path d="M10 46 38 18M19 37l-1-8M26 30l-.5-8.5M19 37l8 1M26 30l8.5.5M49 42c0-4-4-7-11-7.5" fill="none" stroke="#E4EFD9" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="49" cy="50" r="8" fill="#B8322A" />
      <ellipse cx="46.2" cy="47.2" rx="2.2" ry="3" fill="#fff" opacity="0.35" transform="rotate(-30 46.2 47.2)" />
    </svg>
  );
}
