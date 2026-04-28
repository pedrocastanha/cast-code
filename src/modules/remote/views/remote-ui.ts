import { CAST_COMMANDS } from '../../../ui/cast-design/tokens';
import { getCastBaseCss } from '../../../ui/cast-design/web-theme';

function renderSidebarCommands(): string {
  return CAST_COMMANDS.map(({ key, description }) => `
      <div class="sidebar-command">
        <span class="sidebar-command-key">${key}</span>
        <span class="sidebar-command-desc">${description}</span>
      </div>
    `).join('');
}

export function getRemoteHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Cast Code</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    ${getCastBaseCss()}

    body {
      min-height: 100dvh;
    }

    #auth-screen {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 30%),
        radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.08), transparent 26%),
        var(--bg-dark);
      z-index: 40;
    }

    .auth-terminal {
      width: min(540px, 100%);
      border: 1px solid var(--border-strong);
      border-radius: var(--terminal-radius);
      background: var(--bg-base);
      overflow: hidden;
    }

    .auth-body {
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .auth-brand {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 4px;
    }

    .auth-copy {
      color: var(--text-muted);
      font-size: var(--font-sm);
      line-height: 1.7;
    }

    .auth-form-label {
      color: var(--text-muted);
      font-size: var(--font-xs);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .auth-input {
      width: 100%;
      padding: 12px 14px;
      background: var(--bg-deep);
      border: 1px solid var(--border-strong);
      border-radius: var(--panel-radius);
      color: var(--accent-bright);
      outline: none;
      letter-spacing: 0.12em;
    }

    .auth-input:focus {
      border-color: var(--accent-mid);
    }

    .auth-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .auth-btn {
      border: 1px solid var(--border-strong);
      background: var(--accent-mid);
      color: var(--bg-dark);
      padding: 10px 14px;
      border-radius: var(--panel-radius);
      cursor: pointer;
    }

    .auth-error {
      color: var(--error);
      font-size: var(--font-sm);
      display: none;
    }

    #app-screen {
      display: none;
    }

    .remote-terminal {
      min-height: calc(100dvh - 40px);
    }

    .remote-body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .remote-sidebar {
      width: var(--sidebar-width);
      flex-shrink: 0;
      border-right: 1px solid var(--border-strong);
      background: rgba(8, 20, 39, 0.9);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .sidebar-panel {
      padding: 16px;
      border-bottom: 1px solid var(--border-mid);
    }

    .sidebar-meta {
      display: grid;
      gap: 5px;
      font-size: var(--font-sm);
    }

    .sidebar-meta-row {
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 8px;
      align-items: start;
    }

    .sidebar-meta-label {
      color: var(--text-muted);
    }

    .sidebar-meta-value {
      color: var(--accent-bright);
      word-break: break-word;
    }

    .sidebar-meta-value.project {
      color: var(--green);
    }

    .sidebar-meta-value.count {
      color: var(--amber);
    }

    .sidebar-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .sidebar-commands {
      display: grid;
      gap: 9px;
    }

    .sidebar-command {
      display: grid;
      grid-template-columns: 64px 1fr;
      gap: 10px;
      padding: 4px 6px;
      border-radius: 6px;
      font-size: var(--font-sm);
      transition: background 0.15s ease;
    }

    .sidebar-command:hover {
      background: var(--bg-dark);
    }

    .sidebar-command-key {
      color: var(--accent-mid);
    }

    .sidebar-command-desc {
      color: var(--text-muted);
    }

    .sidebar-footer {
      margin-top: auto;
      padding: 12px 16px 14px;
      border-top: 1px solid var(--border-mid);
    }

    .sidebar-section-title {
      color: var(--text-faint);
      font-size: var(--font-xs);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .sidebar-agents {
      display: grid;
      gap: 6px;
      font-size: var(--font-sm);
    }

    .sidebar-agent {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .sidebar-agent-name {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--accent-mid);
    }

    .sidebar-agent-state {
      color: var(--text-faint);
    }

    .remote-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
      position: relative;
    }

    .output-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 18px 20px 12px;
    }

    .output-area code {
      color: var(--purple);
    }

    .chat-welcome {
      color: var(--text-muted);
      font-size: var(--font-sm);
      padding-bottom: 18px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-mid);
      line-height: 1.7;
    }

    .chat-welcome strong {
      display: block;
      color: var(--accent-bright);
      font-size: var(--font-md);
      margin-bottom: 4px;
    }

    .log-line {
      font-size: var(--font-md);
      color: var(--accent-bright);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 1px 0;
    }

    .log-line.user-msg {
      color: var(--accent-bright);
      margin: 8px 0 10px;
      padding-left: 16px;
      border-left: 2px solid var(--border-strong);
    }

    #cmd-palette {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: 112px;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--border-strong);
      border-radius: var(--panel-radius);
      background: var(--bg-deep);
      z-index: 20;
    }

    .palette-header,
    .palette-hint {
      padding: 8px 12px;
      font-size: var(--font-xs);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border-mid);
      color: var(--text-muted);
    }

    .palette-hint {
      border-bottom: none;
      border-top: 1px solid var(--border-mid);
      display: flex;
      gap: 12px;
    }

    .palette-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 6px;
      cursor: pointer;
    }

    .palette-item:hover,
    .palette-item.active {
      background: rgba(56, 189, 248, 0.08);
    }

    .palette-cmd {
      color: var(--accent-mid);
      min-width: 130px;
      flex-shrink: 0;
    }

    .palette-cmd mark {
      background: transparent;
      color: var(--purple);
    }

    .palette-desc,
    .palette-category {
      color: var(--text-muted);
      font-size: var(--font-sm);
    }

    .palette-category {
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 6px 10px 4px;
    }

    .remote-input-region {
      background: var(--bg-dark);
      border-top: 1px solid var(--border-mid);
      padding: 14px 16px 12px;
      flex-shrink: 0;
    }

    .input-shell {
      border: 1px solid var(--border-strong);
      border-radius: var(--panel-radius);
      background: var(--bg-deep);
      overflow: hidden;
    }

    .input-shell-label {
      padding: 8px 12px 6px;
      font-size: var(--font-xs);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-mid);
    }

    .input-row {
      display: flex;
      gap: 10px;
      padding: 12px;
      align-items: flex-end;
    }

    .input-wrap {
      flex: 1;
      position: relative;
    }

    textarea {
      width: 100%;
      min-height: 44px;
      max-height: 140px;
      resize: none;
      background: transparent;
      border: none;
      outline: none;
      color: var(--accent-bright);
      line-height: 1.6;
      font-size: var(--font-md);
    }

    textarea::placeholder {
      color: var(--text-faint);
    }

    .recording-overlay {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      gap: 10px;
      background: var(--bg-deep);
      color: var(--error);
      padding: 0 4px;
    }

    .rec-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--error);
      animation: blink 1.1s step-end infinite;
    }

    .btn {
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      background: var(--bg-dark);
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .btn:hover {
      color: var(--accent-bright);
    }

    .btn-send {
      background: var(--accent-mid);
      color: var(--bg-dark);
      border-color: var(--accent-mid);
    }

    .btn-mic.recording {
      color: var(--error);
      border-color: var(--error);
    }

    .remote-statusbar {
      height: var(--statusbar-height);
      padding: 5px 16px;
      border-top: 1px solid var(--border-mid);
      background: var(--bg-dark);
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--text-faint);
      font-size: var(--font-xs);
      flex-shrink: 0;
    }

    .remote-statusbar .value {
      color: var(--accent-mid);
    }

    .status-spacer {
      margin-left: auto;
    }

    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }

    @media (max-width: 1080px) {
      .cast-shell {
        padding: 12px;
      }

      .remote-body {
        flex-direction: column;
      }

      .remote-sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--border-strong);
      }

      .sidebar-panel,
      .sidebar-footer {
        padding: 12px 14px;
      }
    }

    @media (max-width: 720px) {
      .cast-terminal {
        min-height: calc(100dvh - 24px);
      }

      .cast-titlebar-note,
      .sidebar-command-desc,
      .sidebar-agent-state {
        display: none;
      }

      .sidebar-command {
        grid-template-columns: 64px 1fr;
      }

      #cmd-palette {
        left: 12px;
        right: 12px;
        bottom: 120px;
      }
    }
  </style>
</head>
<body>
  <div id="auth-screen">
    <form class="auth-terminal" onsubmit="handleAuth(event)">
      <div class="cast-titlebar">
        <span class="cast-traffic" style="background: var(--traffic-red)"></span>
        <span class="cast-traffic" style="background: var(--traffic-amber)"></span>
        <span class="cast-traffic" style="background: var(--traffic-green)"></span>
        <div class="cast-tab">remote-access</div>
        <div class="cast-titlebar-note">secure shell gateway</div>
      </div>
      <div class="auth-body">
        <div class="auth-brand">
          <div class="cast-icon">✦</div>
          <div>
            <div class="cast-brand-title">CAST CODE</div>
            <div class="cast-brand-subtitle">Remote terminal session</div>
          </div>
        </div>
        <p class="auth-copy">Enter the access password to bridge this browser to the local Cast session. The layout mirrors the CLI shell and keeps all current remote capabilities intact.</p>
        <label class="auth-form-label" for="password">Access password</label>
        <input type="password" id="password" class="auth-input" placeholder="••••••••" autofocus required>
        <div class="auth-actions">
          <button type="submit" class="auth-btn" id="auth-btn">Connect</button>
          <span class="cast-pill">voice + streaming enabled</span>
        </div>
        <div class="auth-error" id="auth-error">Incorrect password — try again.</div>
      </div>
    </form>
  </div>

  <div id="app-screen" class="cast-shell">
    <div class="cast-terminal remote-terminal">
      <div class="cast-titlebar">
        <span class="cast-traffic" style="background: var(--traffic-red)"></span>
        <span class="cast-traffic" style="background: var(--traffic-amber)"></span>
        <span class="cast-traffic" style="background: var(--traffic-green)"></span>
        <div class="cast-tab">cast-code</div>
        <div class="cast-titlebar-note">remote multi-agent session</div>
      </div>

      <div class="remote-body">
        <aside class="remote-sidebar">
          <div class="sidebar-panel">
            <div class="auth-brand" style="margin-bottom: 12px;">
              <div class="cast-icon">✦</div>
              <div>
                <div class="cast-brand-title">CAST CODE</div>
                <div class="cast-brand-subtitle">Multi-Agent CLI Assistant</div>
              </div>
            </div>
            <div class="sidebar-meta">
              <div class="sidebar-meta-row">
                <span class="sidebar-meta-label">model</span>
                <span class="sidebar-meta-value">remote/session</span>
              </div>
              <div class="sidebar-meta-row">
                <span class="sidebar-meta-label">project</span>
                <span class="sidebar-meta-value project">browser-bridge</span>
              </div>
              <div class="sidebar-meta-row">
                <span class="sidebar-meta-label">tools</span>
                <span class="sidebar-meta-value"><span class="sidebar-meta-value count">30+</span> available</span>
              </div>
              <div class="sidebar-meta-row">
                <span class="sidebar-meta-label">remote</span>
                <span class="sidebar-meta-value"><span class="sidebar-meta-value count">live</span> streaming</span>
              </div>
            </div>
          </div>

          <div class="sidebar-panel">
            <div class="sidebar-pills">
              <span class="cast-pill">voice input</span>
              <span class="cast-pill">remote bridge</span>
              <span class="cast-pill">sse stream</span>
            </div>
          </div>

          <div class="sidebar-panel">
            <div class="sidebar-commands">
              ${renderSidebarCommands()}
            </div>
          </div>

          <div class="sidebar-footer">
            <div class="sidebar-section-title">Active agents</div>
            <div class="sidebar-agents">
              <div class="sidebar-agent">
                <span class="sidebar-agent-name"><span class="cast-status-dot online"></span> planner</span>
                <span class="sidebar-agent-state">idle</span>
              </div>
              <div class="sidebar-agent">
                <span class="sidebar-agent-name"><span class="cast-status-dot online"></span> coder</span>
                <span class="sidebar-agent-state">idle</span>
              </div>
              <div class="sidebar-agent">
                <span class="sidebar-agent-name"><span class="cast-status-dot offline"></span> reviewer</span>
                <span class="sidebar-agent-state">off</span>
              </div>
            </div>
          </div>
        </aside>

        <main class="remote-main">
          <div class="output-area cast-scrollbar" id="chat">
            <div class="chat-welcome">
              <strong>Remote session active</strong>
              Type a message below or start with <code>/</code> to open the command palette. Output streams in real time from the local Cast CLI.
            </div>
          </div>

          <div id="cmd-palette">
            <div class="palette-header">Commands — type to filter</div>
            <div class="palette-list cast-scrollbar" id="palette-list"></div>
            <div class="palette-hint">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> run</span>
              <span><kbd>Esc</kbd> close</span>
            </div>
          </div>

          <div class="remote-input-region">
            <div class="input-shell">
              <div class="input-shell-label">Input</div>
              <div class="input-row">
                <div class="input-wrap">
                  <textarea id="msg-input" placeholder="Write to Cast… (/ for commands)" rows="1" oninput="onInputChange(this)" onkeydown="handleKey(event)"></textarea>
                  <div class="recording-overlay" id="rec-overlay">
                    <div class="rec-dot"></div>
                    Recording…
                  </div>
                </div>
                <button class="btn btn-mic" id="btn-mic" onclick="toggleRecording()" title="Voice input">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                </button>
                <button class="btn btn-send" onclick="sendMessage()" title="Send (Enter)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div class="remote-statusbar">
            <span><span class="cast-status-dot online" id="status-dot"></span> <span id="status-text" class="value">Connecting…</span></span>
            <span><span class="value">/</span> commands</span>
            <span><span class="value">live</span> stream</span>
            <span><span class="value" id="voice-state">mic idle</span></span>
            <span class="status-spacer"></span>
            <span id="remote-clock">--:--</span>
          </div>
        </main>
      </div>
    </div>
  </div>

<script>
  let authToken = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let paletteIndex = -1;
  let paletteItems = [];

  const COMMANDS = [
    { text: '/help', desc: 'Show all commands', cat: 'General' },
    { text: '/clear', desc: 'Clear conversation history', cat: 'General' },
    { text: '/compact', desc: 'Summarize and compress history', cat: 'General' },
    { text: '/context', desc: 'Session info & stats', cat: 'General' },
    { text: '/model', desc: 'Show or switch model', cat: 'General' },
    { text: '/exit', desc: 'Exit cast', cat: 'General' },
    { text: '/init', desc: 'Analyze project & generate context', cat: 'Project' },
    { text: '/project', desc: 'Show project context', cat: 'Project' },
    { text: '/project-deep', desc: 'Deep codebase analysis', cat: 'Project' },
    { text: '/config', desc: 'Open configuration', cat: 'Project' },
    { text: '/status', desc: 'Git status', cat: 'Git' },
    { text: '/diff', desc: 'Git diff', cat: 'Git' },
    { text: '/log', desc: 'Git log (last 15)', cat: 'Git' },
    { text: '/commit', desc: 'Stage & commit changes', cat: 'Git' },
    { text: '/up', desc: 'Smart commit + push', cat: 'Git' },
    { text: '/split-up', desc: 'Split into logical commits', cat: 'Git' },
    { text: '/pr', desc: 'Create Pull Request', cat: 'Git' },
    { text: '/review', desc: 'AI code review', cat: 'Code' },
    { text: '/fix', desc: 'Auto-fix code issues', cat: 'Code' },
    { text: '/ident', desc: 'Format & indent code', cat: 'Code' },
    { text: '/unit-test', desc: 'Generate unit tests', cat: 'Code' },
    { text: '/release', desc: 'Generate release notes', cat: 'Code' },
    { text: '/agents', desc: 'List available agents', cat: 'Agents & Tools' },
    { text: '/skills', desc: 'List loaded skills', cat: 'Agents & Tools' },
    { text: '/tools', desc: 'List available tools', cat: 'Agents & Tools' },
    { text: '/mentions', desc: 'Help with @file mentions', cat: 'Agents & Tools' },
    { text: '/mcp', desc: 'Manage MCP servers', cat: 'Agents & Tools' },
    { text: '/kanban', desc: 'Open Kanban board', cat: 'Interface' },
    { text: '/remote', desc: 'Restart remote web interface', cat: 'Interface' },
  ];

  function xterm256(n) {
    n = n | 0;
    if (n < 16) {
      const c = ['#1a1a1a','#cc3333','#33cc33','#cccc33','#3333cc','#cc33cc','#33cccc','#cccccc',
                 '#888888','#ff5555','#55ff55','#ffff55','#5555ff','#ff55ff','#55ffff','#ffffff'];
      return c[n] || '#ffffff';
    }
    if (n >= 232) {
      const v = 8 + (n - 232) * 10;
      const h = v.toString(16).padStart(2,'0');
      return '#' + h + h + h;
    }
    n -= 16;
    const b = n % 6, g = Math.floor(n / 6) % 6, r = Math.floor(n / 36);
    const ch = v => v ? (55 + v * 40).toString(16).padStart(2,'0') : '00';
    return '#' + ch(r) + ch(g) + ch(b);
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function ansiToHtml(raw) {
    const lines = raw.split('\\n');
    const text = lines.map(l => { const i = l.lastIndexOf('\\r'); return i >= 0 ? l.slice(i + 1) : l; }).join('\\n');
    const clean = text
      .replace(/\\x1b\\[\\?25[lh]/g, '')
      .replace(/\\x1b\\[K/g, '')
      .replace(/\\x1b\\[\\d*[ABCDEFG]/g, '')
      .replace(/\\x1b\\[\\d+;\\d+[Hf]/g, '')
      .replace(/\\x1b\\[2J/g, '');

    const parts = clean.split('\\x1b[');
    let out = escapeHtml(parts[0]);
    let open = 0;

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const m = p.indexOf('m');
      if (m === -1) { out += escapeHtml('\\x1b[' + p); continue; }
      const codes = (p.slice(0, m) || '0').split(';').map(Number);
      const rest = p.slice(m + 1);
      const st = [];
      let ci = 0;
      while (ci < codes.length) {
        const c = codes[ci];
        if (c === 0) {
          while (open > 0) { out += '</span>'; open--; }
        } else if (c === 1) st.push('font-weight:700');
        else if (c === 2) st.push('opacity:0.55');
        else if (c === 3) st.push('font-style:italic');
        else if (c === 4) st.push('text-decoration:underline');
        else if (c >= 30 && c <= 37) {
          const b = ['#1a1a1a','#f87171','#4ade80','#fbbf24','#60a5fa','#c084fc','#67e8f9','#e4e4e7'];
          st.push('color:' + b[c - 30]);
        } else if (c >= 90 && c <= 97) {
          const b = ['#71717a','#f87171','#86efac','#fde68a','#93c5fd','#d8b4fe','#a5f3fc','#fafafa'];
          st.push('color:' + b[c - 90]);
        } else if (c === 38 || c === 48) {
          const prop = c === 38 ? 'color' : 'background-color';
          if (codes[ci + 1] === 5 && codes[ci + 2] != null) { st.push(prop + ':' + xterm256(codes[ci + 2])); ci += 2; }
          else if (codes[ci + 1] === 2 && codes[ci + 4] != null) { st.push(prop + ':rgb(' + codes[ci + 2] + ',' + codes[ci + 3] + ',' + codes[ci + 4] + ')'); ci += 4; }
        }
        ci++;
      }
      if (st.length) { out += '<span style="' + st.join(';') + '">'; open++; }
      out += escapeHtml(rest);
    }
    while (open > 0) { out += '</span>'; open--; }
    return out;
  }

  let rawBuffer = '';

  function pushChunk(raw) {
    const chat = document.getElementById('chat');
    if (raw.startsWith('\\r') && !raw.startsWith('\\r\\n')) {
      const content = raw.slice(1).replace(/\\x1b\\[K/g, '');
      const html = ansiToHtml(content);
      const vis = html.replace(/<[^>]*>/g, '').trim();
      if (!vis) return;
      const last = chat.lastElementChild;
      if (last && last.dataset.transient === 'true') { last.innerHTML = html; }
      else {
        const d = document.createElement('div');
        d.className = 'log-line';
        d.dataset.transient = 'true';
        d.innerHTML = html;
        chat.appendChild(d);
      }
      chat.scrollTop = chat.scrollHeight;
      return;
    }

    const lastEl = chat.lastElementChild;
    if (lastEl && lastEl.dataset.transient === 'true') delete lastEl.dataset.transient;

    rawBuffer += raw;
    const parts = rawBuffer.split('\\n');
    rawBuffer = parts.pop();

    for (const line of parts) {
      const lastCR = line.lastIndexOf('\\r');
      const afterCR = lastCR < 0 ? line : lastCR === line.length - 1 ? line.slice(0, lastCR) : line.slice(lastCR + 1);
      const sd = chat.querySelector('.log-line[data-streaming="true"]');
      const html = ansiToHtml(afterCR);
      const vis = html.replace(/<[^>]*>/g, '').trim();
      if (sd) { sd.innerHTML = html; delete sd.dataset.streaming; }
      else if (vis) {
        const d = document.createElement('div');
        d.className = 'log-line';
        d.innerHTML = html;
        chat.appendChild(d);
      }
    }

    if (rawBuffer) {
      const lastCR = rawBuffer.lastIndexOf('\\r');
      const afterCR = lastCR < 0 ? rawBuffer : lastCR === rawBuffer.length - 1 ? rawBuffer.slice(0, lastCR) : rawBuffer.slice(lastCR + 1);
      const html = ansiToHtml(afterCR);
      const vis = html.replace(/<[^>]*>/g, '').trim();
      const sd = chat.querySelector('.log-line[data-streaming="true"]');
      if (sd) {
        if (vis) sd.innerHTML = html;
      } else if (vis) {
        const d = document.createElement('div');
        d.className = 'log-line';
        d.dataset.streaming = 'true';
        d.innerHTML = html;
        chat.appendChild(d);
      }
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function appendLog(text, isUser = false) {
    const chat = document.getElementById('chat');
    const d = document.createElement('div');
    d.className = 'log-line' + (isUser ? ' user-msg' : '');
    d.innerHTML = isUser ? '› ' + escapeHtml(text) : ansiToHtml(text);
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  function showPalette(query) {
    const palette = document.getElementById('cmd-palette');
    const list = document.getElementById('palette-list');
    const q = query.toLowerCase();
    const filtered = COMMANDS.filter(c => c.text.includes(q) || c.desc.toLowerCase().includes(q));
    paletteItems = filtered;
    paletteIndex = filtered.length > 0 ? 0 : -1;
    if (filtered.length === 0) { hidePalette(); return; }

    const cats = [...new Set(filtered.map(c => c.cat))];
    let html = '';
    for (const cat of cats) {
      const group = filtered.filter(c => c.cat === cat);
      html += '<div class="palette-category">' + escapeHtml(cat) + '</div>';
      for (const cmd of group) {
        const idx = filtered.indexOf(cmd);
        const label = cmd.text.replace(q, '<mark>' + escapeHtml(q) + '</mark>');
        html += '<div class="palette-item' + (idx === paletteIndex ? ' active' : '') + '" data-idx="' + idx + '" onclick="selectPaletteItem(' + idx + ')" onmouseenter="hoverPaletteItem(' + idx + ')"><span class="palette-cmd">' + label + '</span><span class="palette-desc">' + escapeHtml(cmd.desc) + '</span></div>';
      }
    }
    list.innerHTML = html;
    palette.style.display = 'flex';
  }

  function hidePalette() {
    document.getElementById('cmd-palette').style.display = 'none';
    paletteIndex = -1;
    paletteItems = [];
  }

  function hoverPaletteItem(idx) {
    paletteIndex = idx;
    document.querySelectorAll('.palette-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
  }

  function selectPaletteItem(idx) {
    const cmd = paletteItems[idx];
    if (!cmd) return;
    hidePalette();
    const ta = document.getElementById('msg-input');
    ta.value = cmd.text;
    ta.focus();
    sendMessage();
  }

  function navigatePalette(dir) {
    if (paletteItems.length === 0) return;
    paletteIndex = (paletteIndex + dir + paletteItems.length) % paletteItems.length;
    document.querySelectorAll('.palette-item').forEach((el, i) => {
      el.classList.toggle('active', i === paletteIndex);
      if (i === paletteIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function onInputChange(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    const val = ta.value;
    if (val.startsWith('/')) showPalette(val);
    else hidePalette();
  }

  async function handleAuth(e) {
    e.preventDefault();
    const pwd = document.getElementById('password').value;
    const btn = document.getElementById('auth-btn');
    btn.textContent = 'Connecting…';
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        const data = await res.json();
        authToken = data.token;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        connectSSE();
        updateClock();
        setInterval(updateClock, 1000);
      } else {
        document.getElementById('auth-error').style.display = 'block';
        btn.textContent = 'Connect';
        btn.disabled = false;
      }
    } catch {
      document.getElementById('auth-error').textContent = 'Connection failed — check network.';
      document.getElementById('auth-error').style.display = 'block';
      btn.textContent = 'Connect';
      btn.disabled = false;
    }
  }

  async function connectSSE() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.classList.remove('offline');
    dot.classList.add('online');
    text.textContent = 'Connected';
    try {
      const res = await fetch('/api/events?token=' + authToken, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\\n\\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'stdout') pushChunk(data.content);
          } catch {}
        }
      }
    } catch {
      dot.classList.remove('online');
      dot.classList.add('offline');
      text.textContent = 'Disconnected';
      setTimeout(connectSSE, 3000);
    }
  }

  function handleKey(e) {
    const paletteOpen = document.getElementById('cmd-palette').style.display === 'flex';
    if (paletteOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); navigatePalette(+1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); navigatePalette(-1); return; }
      if (e.key === 'Escape') { e.preventDefault(); hidePalette(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (paletteIndex >= 0) selectPaletteItem(paletteIndex); return; }
      if (e.key === 'Tab') { e.preventDefault(); navigatePalette(+1); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  async function sendMessage() {
    const input = document.getElementById('msg-input');
    const msg = input.value.trim();
    if (!msg) return;
    hidePalette();
    appendLog(msg, true);
    input.value = '';
    input.style.height = 'auto';
    input.focus();
    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken, 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ message: msg })
      });
    } catch {
      appendLog('Failed to send — check connection.');
    }
  }

  async function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendAudio(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      document.getElementById('btn-mic').classList.add('recording');
      document.getElementById('rec-overlay').style.display = 'flex';
      document.getElementById('msg-input').disabled = true;
      document.getElementById('voice-state').textContent = 'mic live';
    } catch {
      alert('Microphone access denied.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    isRecording = false;
    document.getElementById('btn-mic').classList.remove('recording');
    document.getElementById('rec-overlay').style.display = 'none';
    document.getElementById('msg-input').disabled = false;
    document.getElementById('msg-input').focus();
    document.getElementById('voice-state').textContent = 'mic idle';
  }

  async function sendAudio(blob) {
    appendLog('Transcribing audio…', true);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        const res = await fetch('/api/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken, 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({ audioBase64: reader.result })
        });
        if (!res.ok) {
          const err = await res.json();
          appendLog('Audio error: ' + (err.error || 'Transcription failed'));
        }
      } catch {
        appendLog('Failed to send audio.');
      }
    };
  }

  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('remote-clock').textContent = hh + ':' + mm + ':' + ss;
  }
</script>
</body>
</html>`;
}
