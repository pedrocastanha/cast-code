export function getRemoteHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Cast Code</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌰</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:         #080810;
      --surface:    #0f0f1a;
      --card:       #141424;
      --border:     rgba(140, 130, 255, 0.12);
      --border-hi:  rgba(140, 130, 255, 0.28);
      --text:       #e8e8f4;
      --muted:      #8888aa;
      --subtle:     #44445a;

      --cyan:    #38d9f5;
      --purple:  #a78bfa;
      --green:   #34d399;
      --yellow:  #fbbf24;
      --red:     #f87171;
      --orange:  #fb923c;

      --glow-c:  0 0 18px rgba(56, 217, 245, 0.18);
      --glow-p:  0 0 18px rgba(167, 139, 250, 0.20);

      --radius:  14px;
      --radius-s: 8px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      background-image:
        radial-gradient(ellipse 60% 40% at 80% 0%, rgba(56,217,245,0.06) 0%, transparent 60%),
        radial-gradient(ellipse 50% 35% at 10% 100%, rgba(167,139,250,0.07) 0%, transparent 60%);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Auth ─────────────────────────────────────── */
    #auth-screen {
      position: absolute;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
    }

    .auth-card {
      width: min(420px, 92vw);
      background: var(--surface);
      border: 1px solid var(--border-hi);
      border-radius: 20px;
      padding: 40px 36px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6), var(--glow-p);
      animation: popIn 0.45s cubic-bezier(0.16,1,0.3,1);
    }

    @keyframes popIn {
      from { opacity: 0; transform: translateY(24px) scale(0.94); }
      to   { opacity: 1; transform: none; }
    }

    .auth-logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 28px;
    }

    .auth-logo-icon {
      width: 38px; height: 38px;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }

    .auth-logo-text {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(90deg, var(--cyan), var(--purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .auth-sub {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 28px;
      line-height: 1.5;
    }

    .auth-input {
      width: 100%;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 13px 18px;
      border-radius: var(--radius-s);
      font-size: 16px;
      letter-spacing: 4px;
      text-align: center;
      outline: none;
      margin-bottom: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
      font-family: 'JetBrains Mono', monospace;
    }

    .auth-input:focus {
      border-color: var(--cyan);
      box-shadow: var(--glow-c);
    }

    .auth-btn {
      width: 100%;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      color: #000;
      border: none;
      padding: 13px;
      border-radius: var(--radius-s);
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.03em;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
    }

    .auth-btn:hover  { opacity: 0.88; transform: translateY(-1px); }
    .auth-btn:active { transform: translateY(0); }

    .auth-error {
      color: var(--red);
      margin-top: 12px;
      font-size: 13px;
      display: none;
    }

    /* ── App layout ───────────────────────────────── */
    #app-screen {
      display: none;
      flex-direction: column;
      height: 100dvh;
    }

    /* ── Header ───────────────────────────────────── */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      height: 52px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border);
      background: rgba(8,8,16,0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 10;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-logo-icon {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    .header-title {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.02em;
      background: linear-gradient(90deg, var(--cyan), var(--purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-sep {
      color: var(--subtle);
      font-weight: 300;
    }

    .header-sub {
      font-size: 12px;
      color: var(--muted);
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 5px 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
      border-radius: 99px;
      font-size: 12px;
      color: var(--muted);
    }

    .status-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 6px var(--green);
      animation: blink 2.4s infinite;
    }

    .status-dot.off {
      background: var(--red);
      box-shadow: 0 0 6px var(--red);
      animation: none;
    }

    @keyframes blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.35; }
    }

    /* ── Chat ─────────────────────────────────────── */
    .chat {
      flex: 1;
      overflow-y: auto;
      padding: 20px 20px 8px;
      display: flex;
      flex-direction: column;
      gap: 1px;
      scroll-behavior: smooth;
    }

    .chat::-webkit-scrollbar       { width: 4px; }
    .chat::-webkit-scrollbar-track  { background: transparent; }
    .chat::-webkit-scrollbar-thumb  { background: var(--subtle); border-radius: 2px; }

    .chat-welcome {
      text-align: center;
      color: var(--muted);
      font-size: 12px;
      padding: 16px 0 24px;
      line-height: 1.6;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .chat-welcome strong {
      color: var(--text);
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .log-line {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 1px 0;
      color: var(--text);
    }

    .log-line.user-msg {
      color: var(--cyan);
      font-weight: 500;
      padding: 6px 12px;
      margin: 8px 0 4px;
      background: rgba(56,217,245,0.06);
      border-left: 2px solid var(--cyan);
      border-radius: 0 6px 6px 0;
    }

    /* ── Command Palette ──────────────────────────── */
    #cmd-palette {
      position: absolute;
      bottom: 72px;
      left: 16px; right: 16px;
      background: var(--card);
      border: 1px solid var(--border-hi);
      border-radius: var(--radius);
      box-shadow: 0 -8px 40px rgba(0,0,0,0.5), var(--glow-p);
      z-index: 50;
      display: none;
      flex-direction: column;
      max-height: 320px;
      overflow: hidden;
      animation: slideUp 0.18s cubic-bezier(0.16,1,0.3,1);
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: none; }
    }

    .palette-header {
      padding: 10px 14px 8px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      flex-shrink: 0;
    }

    .palette-list {
      overflow-y: auto;
      padding: 6px;
    }

    .palette-list::-webkit-scrollbar       { width: 3px; }
    .palette-list::-webkit-scrollbar-track  { background: transparent; }
    .palette-list::-webkit-scrollbar-thumb  { background: var(--subtle); border-radius: 2px; }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: var(--radius-s);
      cursor: pointer;
      transition: background 0.1s;
    }

    .palette-item:hover,
    .palette-item.active {
      background: rgba(167,139,250,0.1);
    }

    .palette-item.active {
      background: rgba(167,139,250,0.15);
    }

    .palette-cmd {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--cyan);
      min-width: 130px;
      flex-shrink: 0;
    }

    .palette-cmd mark {
      background: transparent;
      color: var(--purple);
      font-weight: 700;
    }

    .palette-desc {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .palette-category {
      font-size: 10px;
      color: var(--subtle);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      padding: 6px 10px 2px;
      margin-top: 2px;
    }

    .palette-hint {
      padding: 8px 14px;
      font-size: 11px;
      color: var(--subtle);
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
      flex-shrink: 0;
    }

    .palette-hint kbd {
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
    }

    /* ── Input ────────────────────────────────────── */
    .input-bar {
      padding: 12px 14px;
      background: rgba(8,8,16,0.8);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border);
      display: flex;
      gap: 10px;
      align-items: flex-end;
      flex-shrink: 0;
      position: relative;
    }

    .input-wrap {
      flex: 1;
      position: relative;
    }

    textarea {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 11px 14px;
      border-radius: var(--radius-s);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      resize: none;
      outline: none;
      max-height: 140px;
      min-height: 44px;
      line-height: 1.5;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    textarea:focus {
      border-color: rgba(167,139,250,0.5);
      box-shadow: 0 0 0 3px rgba(167,139,250,0.08);
    }

    textarea::placeholder { color: var(--subtle); }

    .recording-overlay {
      position: absolute;
      inset: 0;
      background: var(--surface);
      border-radius: var(--radius-s);
      border: 1px solid var(--red);
      display: none;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--red);
      font-size: 13px;
      font-weight: 500;
      z-index: 2;
    }

    .rec-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--red);
      animation: blink 0.8s infinite;
    }

    .btn {
      width: 44px; height: 44px;
      border-radius: var(--radius-s);
      border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.18s;
      background: var(--surface);
      color: var(--muted);
    }

    .btn:hover { border-color: var(--border-hi); color: var(--text); background: var(--card); }

    .btn-send {
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      border-color: transparent;
      color: #000;
    }

    .btn-send:hover { opacity: 0.85; border-color: transparent; }

    .btn-mic.recording {
      border-color: var(--red);
      color: var(--red);
      background: rgba(248,113,113,0.08);
      animation: micPulse 1s ease-in-out infinite alternate;
    }

    @keyframes micPulse {
      from { box-shadow: 0 0 4px rgba(248,113,113,0.2); }
      to   { box-shadow: 0 0 16px rgba(248,113,113,0.5); }
    }
  </style>
</head>
<body>

<!-- ── Auth ────────────────────────────────────────── -->
<div id="auth-screen">
  <form class="auth-card" onsubmit="handleAuth(event)">
    <div class="auth-logo">
      <div class="auth-logo-icon">🌰</div>
      <div class="auth-logo-text">cast remote</div>
    </div>
    <p class="auth-sub">Enter your password to start a secure<br>remote terminal session.</p>
    <input type="password" id="password" class="auth-input" placeholder="••••••••" autofocus required>
    <button type="submit" class="auth-btn" id="auth-btn">Connect</button>
    <div class="auth-error" id="auth-error">Incorrect password — try again.</div>
  </form>
</div>

<!-- ── App ─────────────────────────────────────────── -->
<div id="app-screen">
  <header>
    <div class="header-left">
      <div class="header-logo-icon">🌰</div>
      <span class="header-title">cast</span>
      <span class="header-sep">·</span>
      <span class="header-sub">remote session</span>
    </div>
    <div class="status-badge">
      <div class="status-dot" id="status-dot"></div>
      <span id="status-text">Connecting…</span>
    </div>
  </header>

  <div class="chat" id="chat">
    <div class="chat-welcome">
      <strong>Remote session active</strong>
      Type a message or use <code style="color:var(--cyan)">/</code> to browse commands.
    </div>
  </div>

  <!-- Command Palette -->
  <div id="cmd-palette">
    <div class="palette-header">Commands — type to filter</div>
    <div class="palette-list" id="palette-list"></div>
    <div class="palette-hint">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> run</span>
      <span><kbd>Esc</kbd> close</span>
    </div>
  </div>

  <div class="input-bar">
    <div class="input-wrap">
      <textarea id="msg-input" placeholder="Message cast… (/ for commands)" rows="1"
        oninput="onInputChange(this)" onkeydown="handleKey(event)"></textarea>
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

<script>
  // ── State ────────────────────────────────────────────────────────────────
  let authToken     = null;
  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let paletteIndex  = -1;
  let paletteItems  = [];

  // ── Commands (mirrors repl.service.ts getCommandSuggestions) ─────────────
  const COMMANDS = [
    // General
    { text: '/help',         desc: 'Show all commands',                cat: 'General' },
    { text: '/clear',        desc: 'Clear conversation history',        cat: 'General' },
    { text: '/compact',      desc: 'Summarize and compress history',    cat: 'General' },
    { text: '/context',      desc: 'Session info & stats',              cat: 'General' },
    { text: '/model',        desc: 'Show or switch model',              cat: 'General' },
    { text: '/exit',         desc: 'Exit cast',                         cat: 'General' },
    // Project
    { text: '/init',         desc: 'Analyze project & generate context', cat: 'Project' },
    { text: '/project',      desc: 'Show project context',              cat: 'Project' },
    { text: '/project-deep', desc: 'Deep codebase analysis',            cat: 'Project' },
    { text: '/config',       desc: 'Open configuration',                cat: 'Project' },
    // Git
    { text: '/status',       desc: 'Git status',                        cat: 'Git' },
    { text: '/diff',         desc: 'Git diff',                          cat: 'Git' },
    { text: '/log',          desc: 'Git log (last 15)',                  cat: 'Git' },
    { text: '/commit',       desc: 'Stage & commit changes',            cat: 'Git' },
    { text: '/up',           desc: 'Smart commit + push',               cat: 'Git' },
    { text: '/split-up',     desc: 'Split into logical commits',        cat: 'Git' },
    { text: '/pr',           desc: 'Create Pull Request',               cat: 'Git' },
    // Code
    { text: '/review',       desc: 'AI code review',                    cat: 'Code' },
    { text: '/fix',          desc: 'Auto-fix code issues',              cat: 'Code' },
    { text: '/ident',        desc: 'Format & indent code',              cat: 'Code' },
    { text: '/unit-test',    desc: 'Generate unit tests',               cat: 'Code' },
    { text: '/release',      desc: 'Generate release notes',            cat: 'Code' },
    // Agents & Tools
    { text: '/agents',       desc: 'List available agents',             cat: 'Agents & Tools' },
    { text: '/skills',       desc: 'List loaded skills',                cat: 'Agents & Tools' },
    { text: '/tools',        desc: 'List available tools',              cat: 'Agents & Tools' },
    { text: '/mentions',     desc: 'Help with @file mentions',          cat: 'Agents & Tools' },
    { text: '/mcp',          desc: 'Manage MCP servers',                cat: 'Agents & Tools' },
    // Interface
    { text: '/kanban',       desc: 'Open Kanban board',                 cat: 'Interface' },
    { text: '/remote',       desc: 'Restart remote web interface',      cat: 'Interface' },
  ];

  // ── ANSI → HTML ──────────────────────────────────────────────────────────
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
    const text  = lines.map(l => { const i = l.lastIndexOf('\\r'); return i >= 0 ? l.slice(i+1) : l; }).join('\\n');
    const clean = text
      .replace(/\\x1b\\[\\?25[lh]/g,'').replace(/\\x1b\\[K/g,'')
      .replace(/\\x1b\\[\\d*[ABCDEFG]/g,'').replace(/\\x1b\\[\\d+;\\d+[Hf]/g,'')
      .replace(/\\x1b\\[2J/g,'');

    const parts = clean.split('\\x1b[');
    let out = escapeHtml(parts[0]);
    let open = 0;

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i], m = p.indexOf('m');
      if (m === -1) { out += escapeHtml('\\x1b[' + p); continue; }
      const codes = (p.slice(0,m) || '0').split(';').map(Number);
      const rest  = p.slice(m+1);
      const st    = [];
      let ci = 0;
      while (ci < codes.length) {
        const c = codes[ci];
        if (c === 0) { while (open > 0) { out += '</span>'; open--; } }
        else if (c === 1) st.push('font-weight:700');
        else if (c === 2) st.push('opacity:0.55');
        else if (c === 3) st.push('font-style:italic');
        else if (c === 4) st.push('text-decoration:underline');
        else if (c >= 30 && c <= 37) {
          const b = ['#1a1a1a','#f87171','#4ade80','#fbbf24','#60a5fa','#c084fc','#67e8f9','#e4e4e7'];
          st.push('color:' + b[c-30]);
        } else if (c >= 90 && c <= 97) {
          const b = ['#71717a','#f87171','#86efac','#fde68a','#93c5fd','#d8b4fe','#a5f3fc','#fafafa'];
          st.push('color:' + b[c-90]);
        } else if (c === 38 || c === 48) {
          const prop = c === 38 ? 'color' : 'background-color';
          if (codes[ci+1] === 5 && codes[ci+2] != null) { st.push(prop + ':' + xterm256(codes[ci+2])); ci += 2; }
          else if (codes[ci+1] === 2 && codes[ci+4] != null) { st.push(prop + ':rgb(' + codes[ci+2] + ',' + codes[ci+3] + ',' + codes[ci+4] + ')'); ci += 4; }
        }
        ci++;
      }
      if (st.length) { out += '<span style="' + st.join(';') + '">'; open++; }
      out += escapeHtml(rest);
    }
    while (open > 0) { out += '</span>'; open--; }
    return out;
  }

  // ── Stream buffer ─────────────────────────────────────────────────────────
  let rawBuffer = '';

  function pushChunk(raw) {
    const chat = document.getElementById('chat');
    if (raw.startsWith('\\r') && !raw.startsWith('\\r\\n')) {
      const content = raw.slice(1).replace(/\\x1b\\[K/g,'');
      const html = ansiToHtml(content);
      const vis  = html.replace(/<[^>]*>/g,'').trim();
      if (!vis) return;
      const last = chat.lastElementChild;
      if (last && last.dataset.transient === 'true') { last.innerHTML = html; }
      else {
        const d = document.createElement('div');
        d.className = 'log-line'; d.dataset.transient = 'true'; d.innerHTML = html;
        chat.appendChild(d);
      }
      chat.scrollTop = chat.scrollHeight; return;
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
      const vis  = html.replace(/<[^>]*>/g,'').trim();
      if (sd) { sd.innerHTML = html; delete sd.dataset.streaming; }
      else if (vis) { const d = document.createElement('div'); d.className='log-line'; d.innerHTML=html; chat.appendChild(d); }
      else if (!chat.lastElementChild || chat.lastElementChild.innerHTML.trim() !== '') {
        const d = document.createElement('div'); d.className='log-line'; d.innerHTML=''; chat.appendChild(d);
      }
    }
    if (rawBuffer) {
      const lastCR = rawBuffer.lastIndexOf('\\r');
      const afterCR = lastCR < 0 ? rawBuffer : lastCR === rawBuffer.length - 1 ? rawBuffer.slice(0, lastCR) : rawBuffer.slice(lastCR + 1);
      const html = ansiToHtml(afterCR);
      const vis  = html.replace(/<[^>]*>/g,'').trim();
      const sd   = chat.querySelector('.log-line[data-streaming="true"]');
      if (sd) { if (vis) sd.innerHTML = html; }
      else if (vis) { const d = document.createElement('div'); d.className='log-line'; d.dataset.streaming='true'; d.innerHTML=html; chat.appendChild(d); }
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function appendLog(text, isUser = false) {
    const chat = document.getElementById('chat');
    const d = document.createElement('div');
    d.className = 'log-line' + (isUser ? ' user-msg' : '');
    d.innerHTML = isUser ? '> ' + escapeHtml(text) : ansiToHtml(text);
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  // ── Command Palette ───────────────────────────────────────────────────────
  function showPalette(query) {
    const palette = document.getElementById('cmd-palette');
    const list    = document.getElementById('palette-list');
    const q = query.toLowerCase();

    const filtered = COMMANDS.filter(c => c.text.includes(q) || c.desc.toLowerCase().includes(q));
    paletteItems = filtered;
    paletteIndex = filtered.length > 0 ? 0 : -1;

    if (filtered.length === 0) { hidePalette(); return; }

    const cats = [...new Set(filtered.map(c => c.cat))];
    let html = '';
    for (const cat of cats) {
      const group = filtered.filter(c => c.cat === cat);
      html += \`<div class="palette-category">\${escapeHtml(cat)}</div>\`;
      for (const cmd of group) {
        const idx   = filtered.indexOf(cmd);
        const label = cmd.text.replace(q, \`<mark>\${escapeHtml(q)}</mark>\`);
        html += \`<div class="palette-item\${idx === paletteIndex ? ' active' : ''}"
          data-idx="\${idx}"
          onclick="selectPaletteItem(\${idx})"
          onmouseenter="hoverPaletteItem(\${idx})">
          <span class="palette-cmd">\${label}</span>
          <span class="palette-desc">\${escapeHtml(cmd.desc)}</span>
        </div>\`;
      }
    }
    list.innerHTML = html;
    palette.style.display = 'flex';
  }

  function hidePalette() {
    document.getElementById('cmd-palette').style.display = 'none';
    paletteIndex = -1; paletteItems = [];
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
    // Auto-submit the command
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
    // Auto-resize
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    // Command palette
    const val = ta.value;
    if (val.startsWith('/')) {
      showPalette(val);
    } else {
      hidePalette();
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function handleAuth(e) {
    e.preventDefault();
    const pwd = document.getElementById('password').value;
    const btn = document.getElementById('auth-btn');
    btn.textContent = 'Connecting…'; btn.disabled = true;
    try {
      const res = await fetch('/api/auth', {
        method:'POST',
        headers:{ 'Content-Type':'application/json','ngrok-skip-browser-warning':'true' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        const data = await res.json();
        authToken = data.token;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        connectSSE();
      } else {
        document.getElementById('auth-error').style.display = 'block';
        btn.textContent = 'Connect'; btn.disabled = false;
      }
    } catch {
      document.getElementById('auth-error').textContent = 'Connection failed — check network.';
      document.getElementById('auth-error').style.display = 'block';
      btn.textContent = 'Connect'; btn.disabled = false;
    }
  }

  // ── SSE ───────────────────────────────────────────────────────────────────
  async function connectSSE() {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.classList.remove('off'); text.textContent = 'Connected';
    try {
      const res = await fetch(\`/api/events?token=\${authToken}\`, {
        headers:{ 'ngrok-skip-browser-warning':'true' }
      });
      const reader  = res.body.getReader();
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
      dot.classList.add('off'); text.textContent = 'Disconnected';
      setTimeout(connectSSE, 3000);
    }
  }

  // ── Input handling ────────────────────────────────────────────────────────
  function handleKey(e) {
    const paletteOpen = document.getElementById('cmd-palette').style.display === 'flex';
    if (paletteOpen) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); navigatePalette(+1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); navigatePalette(-1); return; }
      if (e.key === 'Escape')     { e.preventDefault(); hidePalette(); return; }
      if (e.key === 'Enter')      { e.preventDefault(); if (paletteIndex >= 0) selectPaletteItem(paletteIndex); return; }
      if (e.key === 'Tab')        { e.preventDefault(); navigatePalette(+1); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  async function sendMessage() {
    const input = document.getElementById('msg-input');
    const msg   = input.value.trim();
    if (!msg) return;
    hidePalette();
    appendLog(msg, true);
    input.value = ''; input.style.height = 'auto'; input.focus();
    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','Authorization':\`Bearer \${authToken}\`,'ngrok-skip-browser-warning':'true' },
        body: JSON.stringify({ message: msg })
      });
    } catch { appendLog('Failed to send — check connection.'); }
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  async function toggleRecording() {
    isRecording ? stopRecording() : startRecording();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks   = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendAudio(blob);
      };
      mediaRecorder.start(); isRecording = true;
      document.getElementById('btn-mic').classList.add('recording');
      document.getElementById('rec-overlay').style.display = 'flex';
      document.getElementById('msg-input').disabled = true;
    } catch { alert('Microphone access denied.'); }
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
  }

  async function sendAudio(blob) {
    appendLog('Transcribing audio…', true);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        const res = await fetch('/api/audio', {
          method: 'POST',
          headers: { 'Content-Type':'application/json','Authorization':\`Bearer \${authToken}\`,'ngrok-skip-browser-warning':'true' },
          body: JSON.stringify({ audioBase64: reader.result })
        });
        if (!res.ok) {
          const err = await res.json();
          appendLog('Audio error: ' + (err.error || 'Transcription failed'));
        }
      } catch { appendLog('Failed to send audio.'); }
    };
  }
</script>
</body>
</html>`;
}
