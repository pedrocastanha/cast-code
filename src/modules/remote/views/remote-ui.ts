export function getRemoteHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>cast · remote</title>
  <style>
    :root {
      --bg: #09090b;
      --surface: rgba(24, 24, 27, 0.6);
      --surface-solid: #18181b;
      --card: rgba(39, 39, 42, 0.5);
      --border: rgba(255, 255, 255, 0.1);
      --border-hover: rgba(255, 255, 255, 0.2);
      --text: #fafafa;
      --muted: #a1a1aa;
      --cyan: #38bdf8;
      --purple: #c084fc;
      --red: #f87171;
      --green: #4ade80;

      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      background-image: radial-gradient(circle at top right, rgba(56, 189, 248, 0.05), transparent 40%),
                        radial-gradient(circle at bottom left, rgba(192, 132, 252, 0.05), transparent 40%);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Auth Screen */
    #auth-screen {
      position: absolute;
      inset: 0;
      z-index: 100;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .auth-card {
      background: var(--surface-solid);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: var(--shadow-lg);
      text-align: center;
      animation: formIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes formIn {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .auth-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 24px;
      color: var(--cyan);
    }

    .auth-input {
      width: 100%;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      margin-bottom: 16px;
      transition: border-color 0.2s;
      text-align: center;
      letter-spacing: 2px;
    }

    .auth-input:focus {
      border-color: var(--cyan);
    }

    .auth-btn {
      width: 100%;
      background: var(--cyan);
      color: #000;
      border: none;
      padding: 12px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
    }

    .auth-btn:hover {
      background: #7dd3fc;
      transform: translateY(-1px);
    }

    /* App UI */
    #app-screen {
      display: none;
      flex-direction: column;
      height: 100vh;
    }

    header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      z-index: 10;
    }

    .logo {
      font-weight: 700;
      font-size: 16px;
      color: var(--cyan);
      letter-spacing: 0.05em;
    }

    .logo span {
      color: var(--muted);
      font-weight: 400;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }

    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s infinite;
    }

    .live-dot.disconnected {
      background: var(--red);
      box-shadow: 0 0 8px var(--red);
      animation: none;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      scroll-behavior: smooth;
    }

    .log-line {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .log-line.user-msg {
      color: var(--cyan);
      margin-top: 8px;
    }

    .input-area {
      padding: 16px 24px;
      background: var(--surface);
      border-top: 1px solid var(--border);
      backdrop-filter: blur(12px);
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }

    .textarea-wrapper {
      flex: 1;
      position: relative;
    }

    textarea {
      width: 100%;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 16px;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      resize: none;
      outline: none;
      max-height: 120px;
      min-height: 46px;
      line-height: 1.5;
      transition: border 0.2s;
    }

    textarea:focus {
      border-color: var(--cyan);
    }

    .btn-action {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.2s;
    }

    .btn-send {
      background: var(--cyan);
      color: #000;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    }

    .btn-send:hover {
      background: #7dd3fc;
      transform: translateY(-2px);
    }

    .btn-mic {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
    }

    .btn-mic:hover {
      border-color: var(--border-hover);
      background: rgba(255,255,255,0.05);
    }

    .btn-mic.recording {
      background: rgba(248, 113, 113, 0.1);
      border-color: var(--red);
      color: var(--red);
      animation: micPulse 1s infinite alternate;
    }

    @keyframes micPulse {
      from { box-shadow: 0 0 5px rgba(248, 113, 113, 0.2); }
      to { box-shadow: 0 0 15px rgba(248, 113, 113, 0.6); }
    }

    .recording-overlay {
      position: absolute;
      inset: 0;
      background: var(--surface-solid);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border: 1px solid var(--red);
      color: var(--red);
      font-weight: 500;
      z-index: 2;
    }
  </style>
</head>
<body>

  <!-- Auth Screen -->
  <div id="auth-screen">
    <form class="auth-card" id="auth-form" onsubmit="handleAuth(event)">
      <div class="auth-title">cast · remote</div>
      <input type="password" id="password" class="auth-input" placeholder="Enter password" autofocus required>
      <button type="submit" class="auth-btn">Connect</button>
      <div id="auth-error" style="color: var(--red); margin-top: 12px; font-size: 13px; display: none;">Invalid password</div>
    </form>
  </div>

  <!-- App UI -->
  <div id="app-screen">
    <header>
      <div class="logo">cast <span>·</span> remote</div>
      <div class="status-indicator">
        <span id="status-text">Connecting...</span>
        <div class="live-dot" id="live-dot"></div>
      </div>
    </header>

    <div class="chat-container" id="chat">
      <div style="color: var(--muted); text-align: center; margin-bottom: 20px; font-size: 12px;">
        Secure terminal session connected. Context and history available.
      </div>
    </div>

    <div class="input-area">
      <div class="textarea-wrapper">
        <textarea id="msg-input" placeholder="Type a command or message... (/help for commands)" onkeydown="handleKey(event)" rows="1"></textarea>
        <div class="recording-overlay" id="recording-overlay">
          <div class="live-dot" style="background: var(--red); box-shadow: none;"></div>
          Recording audio...
        </div>
      </div>
      <button class="btn-action btn-mic" id="btn-mic" onclick="toggleRecording()" title="Record Audio">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      </button>
      <button class="btn-action btn-send" onclick="sendMessage()" title="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  </div>

<script>
  let authToken = null;
  let es = null;

  // Audio Recording State
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  // ─── ANSI → HTML ──────────────────────────────────────────────────────────

  function xterm256(n) {
    n = n | 0;
    if (n < 16) {
      const c = [
        '#1a1a1a','#cc3333','#33cc33','#cccc33','#3333cc','#cc33cc','#33cccc','#cccccc',
        '#888888','#ff5555','#55ff55','#ffff55','#5555ff','#ff55ff','#55ffff','#ffffff'
      ];
      return c[n] || '#ffffff';
    }
    if (n >= 232) {
      const v = 8 + (n - 232) * 10;
      const h = v.toString(16).padStart(2, '0');
      return '#' + h + h + h;
    }
    n -= 16;
    const b = n % 6;
    const g = Math.floor(n / 6) % 6;
    const r = Math.floor(n / 36);
    const ch = v => v ? (55 + v * 40).toString(16).padStart(2, '0') : '00';
    return '#' + ch(r) + ch(g) + ch(b);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ansiToHtml(raw) {
    // Simulate carriage-return line overwriting: for each \\n-segment, keep only
    // the content after the last \\r (mimics terminal cursor-to-col-0 behaviour).
    const lines = raw.split('\\n');
    const processed = lines.map(line => {
      const lastCR = line.lastIndexOf('\\r');
      return lastCR >= 0 ? line.slice(lastCR + 1) : line;
    });
    const text = processed.join('\\n');

    // Strip non-colour escape sequences (cursor movement, erase, etc.)
    const cleaned = text
      .replace(/\\x1b\\[\\?25[lh]/g, '')       // cursor hide/show
      .replace(/\\x1b\\[K/g, '')               // erase to end of line
      .replace(/\\x1b\\[\\d*[ABCDEFG]/g, '')   // cursor up/down/left/right
      .replace(/\\x1b\\[\\d+;\\d+[Hf]/g, '')  // cursor position
      .replace(/\\x1b\\[2J/g, '');             // clear screen

    // Parse colour / style codes
    const parts = cleaned.split('\\x1b[');
    let result = escapeHtml(parts[0]);
    let openSpans = 0;

    for (let idx = 1; idx < parts.length; idx++) {
      const part = parts[idx];
      const mEnd = part.indexOf('m');

      if (mEnd === -1) {
        // Not a colour code — emit literally
        result += escapeHtml('\\x1b[' + part);
        continue;
      }

      const codeStr = part.substring(0, mEnd);
      const rest    = part.substring(mEnd + 1);
      const codes   = codeStr === '' ? [0] : codeStr.split(';').map(Number);

      const styles = [];
      let i = 0;
      while (i < codes.length) {
        const code = codes[i];
        if (code === 0) {
          // Reset — close all open spans
          while (openSpans > 0) { result += '</span>'; openSpans--; }
        } else if (code === 1) {
          styles.push('font-weight:700');
        } else if (code === 2) {
          styles.push('opacity:0.55');
        } else if (code === 3) {
          styles.push('font-style:italic');
        } else if (code === 4) {
          styles.push('text-decoration:underline');
        } else if (code >= 30 && code <= 37) {
          const base = ['#1a1a1a','#f87171','#4ade80','#fbbf24','#60a5fa','#c084fc','#67e8f9','#e4e4e7'];
          styles.push('color:' + base[code - 30]);
        } else if (code >= 90 && code <= 97) {
          const bright = ['#71717a','#f87171','#86efac','#fde68a','#93c5fd','#d8b4fe','#a5f3fc','#fafafa'];
          styles.push('color:' + bright[code - 90]);
        } else if (code === 38 || code === 48) {
          const prop = code === 38 ? 'color' : 'background-color';
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            styles.push(prop + ':' + xterm256(codes[i + 2]));
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            styles.push(prop + ':rgb(' + codes[i+2] + ',' + codes[i+3] + ',' + codes[i+4] + ')');
            i += 4;
          }
        }
        i++;
      }

      if (styles.length > 0) {
        result += '<span style="' + styles.join(';') + '">';
        openSpans++;
      }
      result += escapeHtml(rest);
    }

    while (openSpans > 0) { result += '</span>'; openSpans--; }
    return result;
  }

  // ─── Stream line buffer ───────────────────────────────────────────────────
  // Accumulates raw chunks and only commits a DOM element per complete line
  // (terminated by \\n). Streaming tokens no longer create one div each.

  let rawBuffer = '';

  function pushChunk(raw) {
    const chat = document.getElementById('chat');

    // Spinner / overwrite frames: chunk starts with \\r but NOT \\r\\n
    if (raw.startsWith('\\r') && !raw.startsWith('\\r\\n')) {
      const content = raw.slice(1).replace(/\\x1b\\[K/g, '');
      const html = ansiToHtml(content);
      const visible = html.replace(/<[^>]*>/g, '').trim();
      if (!visible) return;
      const last = chat.lastElementChild;
      if (last && last.dataset.transient === 'true') {
        last.innerHTML = html;
      } else {
        const div = document.createElement('div');
        div.className = 'log-line';
        div.dataset.transient = 'true';
        div.innerHTML = html;
        chat.appendChild(div);
      }
      chat.scrollTop = chat.scrollHeight;
      return;
    }

    // Clear transient flag on the last element when normal content arrives
    const lastEl = chat.lastElementChild;
    if (lastEl && lastEl.dataset.transient === 'true') {
      delete lastEl.dataset.transient;
    }

    rawBuffer += raw;

    // Split on newlines — only fully terminated lines are committed to DOM
    const parts = rawBuffer.split('\\n');
    // The last element is the in-progress line (may have no \\n yet)
    rawBuffer = parts.pop();

    for (const line of parts) {
      // Simulate \\r within a completed line: keep text after last \\r
      const afterCR = line.includes('\\r') ? line.slice(line.lastIndexOf('\\r') + 1) : line;

      // Finalize the streaming div if one is open, otherwise create a new div
      const streamDiv = chat.querySelector('.log-line[data-streaming="true"]');
      const html = ansiToHtml(afterCR);
      const visible = html.replace(/<[^>]*>/g, '').trim();

      if (streamDiv) {
        streamDiv.innerHTML = html;
        delete streamDiv.dataset.streaming;
      } else if (visible) {
        const div = document.createElement('div');
        div.className = 'log-line';
        div.innerHTML = html;
        chat.appendChild(div);
      } else if (!chat.lastElementChild || chat.lastElementChild.innerHTML.trim() !== '') {
        // Empty line — only if previous line is non-empty (collapse blanks)
        const div = document.createElement('div');
        div.className = 'log-line';
        div.innerHTML = '';
        chat.appendChild(div);
      }
    }

    // Update / create the in-progress streaming div
    if (rawBuffer !== undefined && rawBuffer !== '') {
      const afterCR = rawBuffer.includes('\\r') ? rawBuffer.slice(rawBuffer.lastIndexOf('\\r') + 1) : rawBuffer;
      const html = ansiToHtml(afterCR);
      const visible = html.replace(/<[^>]*>/g, '').trim();
      const streamDiv = chat.querySelector('.log-line[data-streaming="true"]');
      if (streamDiv) {
        if (visible) streamDiv.innerHTML = html;
      } else if (visible) {
        const div = document.createElement('div');
        div.className = 'log-line';
        div.dataset.streaming = 'true';
        div.innerHTML = html;
        chat.appendChild(div);
      }
    }

    chat.scrollTop = chat.scrollHeight;
  }

  // ─── Log rendering ────────────────────────────────────────────────────────

  function appendLog(text, isUser = false) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    if (isUser) {
      div.className = 'log-line user-msg';
      div.innerHTML = '> ' + escapeHtml(text);
    } else {
      div.className = 'log-line';
      div.innerHTML = ansiToHtml(text);
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async function handleAuth(e) {
    e.preventDefault();
    const pwd = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
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
        btn.textContent = 'Connect';
        btn.disabled = false;
      }
    } catch (err) {
      document.getElementById('auth-error').textContent = 'Connection failed';
      document.getElementById('auth-error').style.display = 'block';
      btn.textContent = 'Connect';
      btn.disabled = false;
    }
  }

  // ─── SSE stream ───────────────────────────────────────────────────────────

  async function connectSSE() {
    const dot = document.getElementById('live-dot');
    const statusText = document.getElementById('status-text');

    dot.classList.remove('disconnected');
    statusText.textContent = 'Connected';

    try {
      const res = await fetch(\`/api/events?token=\${authToken}\`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let lines = buffer.split('\\n\\n');
        buffer = lines.pop();

        for (let line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'stdout') {
                pushChunk(data.content);
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      dot.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
      setTimeout(connectSSE, 3000);
    }
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function sendMessage() {
    const input = document.getElementById('msg-input');
    const msg = input.value.trim();
    if (!msg) return;

    appendLog(msg, true);
    input.value = '';
    input.style.height = 'auto';

    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${authToken}\`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ message: msg })
      });
    } catch {
      appendLog('Failed to send message.', true);
    }
  }

  // ─── Audio Recording ──────────────────────────────────────────────────────

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendAudioMessage(audioBlob);
      };

      mediaRecorder.start();
      isRecording = true;

      document.getElementById('btn-mic').classList.add('recording');
      document.getElementById('recording-overlay').style.display = 'flex';
      document.getElementById('msg-input').disabled = true;

    } catch (err) {
      console.error('Mic error:', err);
      alert('Could not access microphone. Check permissions.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    isRecording = false;

    document.getElementById('btn-mic').classList.remove('recording');
    document.getElementById('recording-overlay').style.display = 'none';
    document.getElementById('msg-input').disabled = false;
    document.getElementById('msg-input').focus();
  }

  async function sendAudioMessage(blob) {
    appendLog('Transcribing audio...', true);

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result;

      try {
        const res = await fetch('/api/audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${authToken}\`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ audioBase64: base64data })
        });

        if (!res.ok) {
          const err = await res.json();
          appendLog('Audio error: ' + (err.error || 'Transcription failed'));
        }
      } catch (e) {
        appendLog('Failed to send audio.', true);
      }
    };
  }

  // ─── Textarea auto-resize ─────────────────────────────────────────────────

  const tx = document.getElementById('msg-input');
  tx.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
</script>
</body>
</html>`;
}
