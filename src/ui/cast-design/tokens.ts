export const CAST_FONT_STACK = '\'JetBrains Mono\', \'Fira Code\', \'Cascadia Code\', \'Courier New\', monospace';

export const CAST_COLORS = {
  bgDeep: '#040b16',
  bgDark: '#060e1c',
  bgBase: '#0a1628',
  borderMid: '#152d4a',
  borderStrong: '#1e3a5f',
  accentDim: '#0ea5e9',
  accentMid: '#38bdf8',
  accentBright: '#7dd3fc',
  textMuted: '#2d6a9f',
  textFaint: '#1a3f5c',
  green: '#34d399',
  amber: '#fbbf24',
  purple: '#818cf8',
  error: '#f87171',
  white: '#ffffff',
  trafficRed: '#ff5f56',
  trafficAmber: '#ffbd2e',
  trafficGreen: '#27c93f',
} as const;

export const CAST_DIMENSIONS = {
  terminalRadius: '12px',
  panelRadius: '6px',
  pillRadius: '20px',
  titlebarHeight: '40px',
  statusbarHeight: '26px',
  sidebarWidth: '280px',
} as const;

export const CAST_FONT_SIZES = {
  xs: '10px',
  sm: '11px',
  md: '12px',
  lg: '13px',
  icon: '14px',
} as const;

export const CAST_SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
} as const;

export const CAST_COMMANDS = [
  { key: '/help', description: 'Show all commands' },
  { key: '/init', description: 'Map project context' },
  { key: '/agent', description: 'Spawn a new sub-agent' },
  { key: '@file', description: 'Inject file into prompt' },
  { key: 'Tab', description: 'Accept suggestions' },
] as const;

export const CAST_AGENT_LABELS = ['planner', 'coder', 'reviewer'] as const;

export type CastColorName = keyof typeof CAST_COLORS;
