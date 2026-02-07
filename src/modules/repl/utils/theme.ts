export const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  primary: '\x1b[36m',
  secondary: '\x1b[35m',
  accent: '\x1b[33m',

  success: '\x1b[32m',
  error: '\x1b[31m',
  warning: '\x1b[33m',
  info: '\x1b[34m',

  text: '\x1b[37m',
  muted: '\x1b[90m',

  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
} as const;

export const colorize = (text: string, color: keyof typeof Colors): string => {
  return `${Colors[color]}${text}${Colors.reset}`;
};

export const Box = {
  topLeft: '\u256d',
  topRight: '\u256e',
  bottomLeft: '\u2570',
  bottomRight: '\u256f',
  horizontal: '\u2500',
  vertical: '\u2502',
} as const;

export const Icons = {
  check: '\u2713',
  cross: '\u2717',
  arrow: '\u276f',
  bullet: '\u2022',
  spinner: ['\u28cb', '\u28d9', '\u28f9', '\u28f8', '\u28fc', '\u28f4', '\u28e6', '\u28e7', '\u28c7', '\u28cf'],
} as const;
