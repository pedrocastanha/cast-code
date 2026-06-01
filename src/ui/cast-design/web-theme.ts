import { CAST_COLORS, CAST_DIMENSIONS, CAST_FONT_SIZES, CAST_FONT_STACK, CAST_SPACING } from './tokens';

export function getCastCssVariables(): string {
  return `
    :root {
      --bg-deep: ${CAST_COLORS.bgDeep};
      --bg-dark: ${CAST_COLORS.bgDark};
      --bg-base: ${CAST_COLORS.bgBase};
      --border-mid: ${CAST_COLORS.borderMid};
      --border-strong: ${CAST_COLORS.borderStrong};
      --accent-dim: ${CAST_COLORS.accentDim};
      --accent-mid: ${CAST_COLORS.accentMid};
      --accent-bright: ${CAST_COLORS.accentBright};
      --text-muted: ${CAST_COLORS.textMuted};
      --text-faint: ${CAST_COLORS.textFaint};
      --green: ${CAST_COLORS.green};
      --amber: ${CAST_COLORS.amber};
      --purple: ${CAST_COLORS.purple};
      --error: ${CAST_COLORS.error};
      --white: ${CAST_COLORS.white};
      --traffic-red: ${CAST_COLORS.trafficRed};
      --traffic-amber: ${CAST_COLORS.trafficAmber};
      --traffic-green: ${CAST_COLORS.trafficGreen};

      --terminal-radius: ${CAST_DIMENSIONS.terminalRadius};
      --panel-radius: ${CAST_DIMENSIONS.panelRadius};
      --pill-radius: ${CAST_DIMENSIONS.pillRadius};
      --titlebar-height: ${CAST_DIMENSIONS.titlebarHeight};
      --statusbar-height: ${CAST_DIMENSIONS.statusbarHeight};
      --sidebar-width: ${CAST_DIMENSIONS.sidebarWidth};

      --font-xs: ${CAST_FONT_SIZES.xs};
      --font-sm: ${CAST_FONT_SIZES.sm};
      --font-md: ${CAST_FONT_SIZES.md};
      --font-lg: ${CAST_FONT_SIZES.lg};
      --font-icon: ${CAST_FONT_SIZES.icon};

      --space-xs: ${CAST_SPACING.xs};
      --space-sm: ${CAST_SPACING.sm};
      --space-md: ${CAST_SPACING.md};
      --space-lg: ${CAST_SPACING.lg};
      --space-xl: ${CAST_SPACING.xl};
      --font-mono: ${CAST_FONT_STACK};
    }
  `;
}

export function getCastBaseCss(): string {
  return `
    ${getCastCssVariables()}

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      min-height: 100%;
    }

    body {
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 36%),
        radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.08), transparent 28%),
        var(--bg-dark);
      color: var(--accent-bright);
      font-family: var(--font-mono);
      font-size: var(--font-md);
      line-height: 1.6;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    button,
    input,
    textarea {
      font: inherit;
    }

    ::selection {
      background: rgba(56, 189, 248, 0.28);
      color: var(--white);
    }

    code,
    pre,
    kbd {
      font-family: var(--font-mono);
    }

    .cast-shell {
      min-height: 100dvh;
      padding: 20px;
    }

    .cast-terminal {
      display: flex;
      flex-direction: column;
      width: min(1280px, 100%);
      min-height: calc(100dvh - 40px);
      margin: 0 auto;
      border: 1px solid var(--border-strong);
      border-radius: var(--terminal-radius);
      background: var(--bg-base);
      overflow: hidden;
    }

    .cast-titlebar {
      height: var(--titlebar-height);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-dark);
      border-bottom: 1px solid var(--border-mid);
      flex-shrink: 0;
    }

    .cast-traffic {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .cast-tab {
      margin-left: 12px;
      padding: 8px 12px 9px;
      color: var(--accent-mid);
      background: var(--bg-base);
      border: 1px solid var(--border-strong);
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      font-size: var(--font-sm);
      letter-spacing: 0.04em;
      line-height: 1;
    }

    .cast-titlebar-note {
      color: var(--text-faint);
      font-size: var(--font-xs);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-left: auto;
    }

    .cast-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--accent-dim), var(--accent-mid));
      color: var(--white);
      font-size: var(--font-icon);
      font-weight: 700;
      flex-shrink: 0;
    }

    .cast-brand-title {
      color: var(--accent-bright);
      font-size: var(--font-lg);
      font-weight: 700;
      letter-spacing: 0.14em;
    }

    .cast-brand-subtitle {
      color: var(--text-muted);
      font-size: var(--font-xs);
      letter-spacing: 0.08em;
    }

    .cast-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: var(--pill-radius);
      border: 1px solid var(--border-strong);
      background: var(--bg-dark);
      color: var(--text-muted);
      font-size: var(--font-xs);
      line-height: 1.4;
    }

    .cast-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .cast-status-dot.online {
      background: var(--green);
      box-shadow: 0 0 4px rgba(52, 211, 153, 0.45);
    }

    .cast-status-dot.offline {
      background: var(--border-strong);
    }

    .cast-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    .cast-scrollbar::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 999px;
    }

    .cast-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
  `;
}
