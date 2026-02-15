export const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  primary: '\x1b[38;5;51m',   
  secondary: '\x1b[38;5;183m',
  accent: '\x1b[38;5;220m', 

  success: '\x1b[38;5;82m', 
  error: '\x1b[38;5;196m',  
  warning: '\x1b[38;5;208m',
  info: '\x1b[38;5;39m',   

  text: '\x1b[37m',
  muted: '\x1b[38;5;245m', 
  subtle: '\x1b[38;5;240m',

  cyan: '\x1b[38;5;51m',
  green: '\x1b[38;5;82m',
  yellow: '\x1b[38;5;220m',
  red: '\x1b[38;5;196m',
  magenta: '\x1b[38;5;183m',
  blue: '\x1b[38;5;39m',
  gray: '\x1b[38;5;245m',
  white: '\x1b[37m',
} as const;

export const colorize = (text: string, color: keyof typeof Colors): string => {
  return `${Colors[color]}${text}${Colors.reset}`;
};

export const Box = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  leftT: '├',
  rightT: '┤',
  topT: '┬',
  bottomT: '┴',
  cross: '┼',
  thickH: '━',
  thickV: '┃',
} as const;

export const Icons = {
  check: '✓',
  cross: '✗',
  arrow: '❯',
  bullet: '•',
  diamond: '◆',
  star: '★',
  circle: '●',
  dot: '·',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  tool: '⏿',
  search: '🔍',
  file: '📄',
  folder: '📁',
  git: '⎇',
  branch: '⎇',
  cloud: '☁',
  rocket: '🚀',
  gear: '⚙',
  lightbulb: '💡',
  sparkles: '✨',
  wand: '🪄',
  robot: '🤖',
  pending: '○',
  inProgress: '◐',
  done: '✓',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  chestnut: '🌰',
  thinkingChestnut: ['🌰◜', '🌰◠', '🌰◝', '🌰◞', '🌰◡', '🌰◟'],
} as const;

export const UI = {
  line: (width: number, char = Box.horizontal, color: keyof typeof Colors = 'subtle'): string => {
    return colorize(char.repeat(width), color);
  },

  box: (content: string[], width = 50, title?: string): string => {
    const lines: string[] = [];
    const innerWidth = width - 4;

    if (title) {
      const titleLen = title.length;
      const leftPad = Math.floor((innerWidth - titleLen) / 2);
      const rightPad = innerWidth - titleLen - leftPad;
      lines.push(
        colorize(Box.topLeft, 'primary') +
        colorize(Box.horizontal.repeat(leftPad), 'subtle') +
        colorize(' ' + title + ' ', 'bold') +
        colorize(Box.horizontal.repeat(rightPad), 'subtle') +
        colorize(Box.topRight, 'primary')
      );
    } else {
      lines.push(
        colorize(Box.topLeft + Box.horizontal.repeat(innerWidth + 2) + Box.topRight, 'primary')
      );
    }

    for (const line of content) {
      const truncated = line.length > innerWidth ? line.slice(0, innerWidth - 1) + '…' : line;
      const padding = ' '.repeat(innerWidth - truncated.length);
      lines.push(
        colorize(Box.vertical + ' ', 'primary') +
        truncated +
        padding +
        colorize(' ' + Box.vertical, 'primary')
      );
    }

    lines.push(
      colorize(Box.bottomLeft + Box.horizontal.repeat(innerWidth + 2) + Box.bottomRight, 'primary')
    );

    return lines.join('\n');
  },

  header: (text: string, icon?: string): string => {
    const prefix = icon ? colorize(icon + ' ', 'accent') : '';
    return '\n' + prefix + colorize(text, 'bold') + '\n' + colorize(Box.horizontal.repeat(text.length + (icon ? 2 : 0)), 'subtle');
  },

  kv: (key: string, value: string, width = 12): string => {
    const paddedKey = key.padEnd(width);
    return colorize(paddedKey, 'muted') + ' ' + value;
  },

  item: (text: string, icon = Icons.bullet, iconColor: keyof typeof Colors = 'primary'): string => {
    return '  ' + colorize(icon, iconColor) + ' ' + text;
  },

  success: (text: string): string => {
    return colorize(Icons.check + ' ' + text, 'success');
  },

  error: (text: string): string => {
    return colorize(Icons.cross + ' ' + text, 'error');
  },

  warning: (text: string): string => {
    return '⚠ ' + colorize(text, 'warning');
  },

  pad: (text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string => {
    const len = text.length;
    if (len >= width) return text;
    
    if (align === 'center') {
      const left = Math.floor((width - len) / 2);
      const right = width - len - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    } else if (align === 'right') {
      return ' '.repeat(width - len) + text;
    }
    return text + ' '.repeat(width - len);
  },

  progress: (percent: number, width = 20): string => {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = colorize('█'.repeat(filled), 'success') + colorize('░'.repeat(empty), 'subtle');
    return '[' + bar + '] ' + colorize(percent + '%', 'muted');
  },
} as const;
