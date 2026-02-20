export function getKanbanHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>cast · kanban</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --card: #21262d;
    --border: #30363d;
    --border-hover: #484f58;
    --text: #e6edf3;
    --muted: #7d8590;
    --cyan: #58a6ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --orange: #e3b341;
    --purple: #bc8cff;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .logo {
    font-weight: 700;
    font-size: 14px;
    color: var(--cyan);
    letter-spacing: 0.05em;
  }

  .logo span {
    color: var(--muted);
    font-weight: 400;
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 6px var(--green);
    animation: pulse 2s infinite;
  }

  .live-dot.disconnected {
    background: var(--red);
    box-shadow: 0 0 6px var(--red);
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .task-count {
    color: var(--muted);
    font-size: 12px;
  }

  .plan-badge {
    background: rgba(88, 166, 255, 0.1);
    border: 1px solid rgba(88, 166, 255, 0.3);
    color: var(--cyan);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 16px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .column {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .column-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .column-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .col-pending .column-label { color: var(--muted); }
  .col-inprogress .column-label { color: var(--orange); }
  .col-done .column-label { color: var(--green); }
  .col-failed .column-label { color: var(--red); }

  .col-inprogress { border-top: 2px solid var(--orange); }
  .col-done { border-top: 2px solid var(--green); }
  .col-failed { border-top: 2px solid var(--red); }
  .col-pending { border-top: 2px solid var(--border); }

  .column-count {
    margin-left: auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
    color: var(--muted);
    min-width: 22px;
    text-align: center;
  }

  .cards {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cards::-webkit-scrollbar { width: 4px; }
  .cards::-webkit-scrollbar-track { background: transparent; }
  .cards::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: default;
    transition: border-color 0.15s, transform 0.15s;
    animation: cardIn 0.2s ease-out;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card:hover {
    border-color: var(--border-hover);
  }

  .card.highlight {
    animation: highlight 0.6s ease-out;
  }

  @keyframes highlight {
    0% { border-color: var(--cyan); box-shadow: 0 0 8px rgba(88, 166, 255, 0.3); }
    100% { border-color: var(--border); box-shadow: none; }
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-id {
    color: var(--muted);
    font-size: 10px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .card-subject {
    font-weight: 600;
    font-size: 12px;
    line-height: 1.4;
    flex: 1;
    word-break: break-word;
  }

  .card-description {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .badge-pending { background: rgba(125, 133, 144, 0.15); color: var(--muted); }
  .badge-in_progress { background: rgba(227, 179, 65, 0.15); color: var(--orange); }
  .badge-completed { background: rgba(63, 185, 80, 0.15); color: var(--green); }
  .badge-failed { background: rgba(248, 81, 73, 0.15); color: var(--red); }
  .badge-blocked { background: rgba(210, 153, 34, 0.15); color: var(--yellow); }
  .badge-cancelled { background: rgba(125, 133, 144, 0.1); color: var(--muted); }

  .badge-agent {
    background: rgba(188, 140, 255, 0.12);
    color: var(--purple);
    border: 1px solid rgba(188, 140, 255, 0.2);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .badge-dep {
    background: rgba(88, 166, 255, 0.08);
    color: rgba(88, 166, 255, 0.6);
    border: 1px solid rgba(88, 166, 255, 0.15);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(227, 179, 65, 0.2);
    border-top-color: var(--orange);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--border);
    font-size: 11px;
    padding: 20px;
    text-align: center;
  }
</style>
</head>
<body>

<header>
  <div class="logo">cast <span>·</span> kanban</div>
  <div class="live-dot" id="liveDot"></div>
  <div class="header-right">
    <span class="task-count" id="taskCount">0 tasks</span>
    <span class="plan-badge" id="planBadge" style="display:none"></span>
  </div>
</header>

<div class="board">
  <div class="column col-pending" id="col-pending">
    <div class="column-header">
      <span class="column-label">Backlog</span>
      <span class="column-count" id="count-pending">0</span>
    </div>
    <div class="cards" id="cards-pending"></div>
  </div>
  <div class="column col-inprogress" id="col-inprogress">
    <div class="column-header">
      <span class="column-label">In Progress</span>
      <span class="column-count" id="count-inprogress">0</span>
    </div>
    <div class="cards" id="cards-inprogress"></div>
  </div>
  <div class="column col-done" id="col-done">
    <div class="column-header">
      <span class="column-label">Done</span>
      <span class="column-count" id="count-done">0</span>
    </div>
    <div class="cards" id="cards-done"></div>
  </div>
  <div class="column col-failed" id="col-failed">
    <div class="column-header">
      <span class="column-label">Failed / Blocked</span>
      <span class="column-count" id="count-failed">0</span>
    </div>
    <div class="cards" id="cards-failed"></div>
  </div>
</div>

<script>
  const COL_MAP = {
    pending: 'pending',
    in_progress: 'inprogress',
    completed: 'done',
    failed: 'failed',
    blocked: 'failed',
    cancelled: 'failed',
  };

  let tasks = {};
  let sseRetryTimer = null;

  function col(status) {
    return COL_MAP[status] || 'pending';
  }

  function makeCard(task) {
    const colKey = col(task.status);
    const isInProgress = task.status === 'in_progress';

    const depBadges = task.dependencies.length > 0
      ? task.dependencies.map(d => '<span class="badge badge-dep">↳ ' + d + '</span>').join('')
      : '';

    const agentBadge = task.assignedAgent
      ? '<span class="badge badge-agent">⬡ ' + task.assignedAgent + '</span>'
      : '';

    const spinner = isInProgress ? '<div class="spinner"></div>' : '';

    return \`
      <div class="card" id="card-\${task.id}" data-status="\${task.status}">
        <div class="card-top">
          \${spinner}
          <span class="card-id">\${task.id}</span>
          <span class="card-subject">\${escHtml(task.subject)}</span>
        </div>
        \${task.description ? '<div class="card-description">' + escHtml(task.description) + '</div>' : ''}
        <div class="card-footer">
          <span class="badge badge-\${task.status}">\${task.status.replace('_', ' ')}</span>
          \${agentBadge}
          \${depBadges}
        </div>
      </div>
    \`;
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderAll() {
    const cols = { pending: [], inprogress: [], done: [], failed: [] };

    for (const task of Object.values(tasks)) {
      cols[col(task.status)].push(task);
    }

    for (const [key, list] of Object.entries(cols)) {
      const container = document.getElementById('cards-' + key);
      const count = document.getElementById('count-' + key);

      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">—</div>';
      } else {
        container.innerHTML = list.map(makeCard).join('');
      }
      count.textContent = list.length;
    }

    const total = Object.keys(tasks).length;
    document.getElementById('taskCount').textContent = total + ' task' + (total !== 1 ? 's' : '');
  }

  function upsertTask(task) {
    const existed = !!tasks[task.id];
    tasks[task.id] = task;

    if (existed) {
      const card = document.getElementById('card-' + task.id);
      const newColKey = col(task.status);

      if (card) {
        const currentContainer = card.parentElement;
        const targetContainer = document.getElementById('cards-' + newColKey);

        if (currentContainer !== targetContainer) {
          renderAll();
        } else {
          card.outerHTML = makeCard(task);
          const updated = document.getElementById('card-' + task.id);
          if (updated) {
            updated.classList.add('highlight');
            setTimeout(() => updated.classList.remove('highlight'), 700);
          }
          updateCounts();
        }
      } else {
        renderAll();
      }
    } else {
      renderAll();
    }
  }

  function updateCounts() {
    const cols = { pending: 0, inprogress: 0, done: 0, failed: 0 };
    for (const task of Object.values(tasks)) {
      cols[col(task.status)]++;
    }
    for (const [key, count] of Object.entries(cols)) {
      document.getElementById('count-' + key).textContent = count;
    }
    const total = Object.keys(tasks).length;
    document.getElementById('taskCount').textContent = total + ' task' + (total !== 1 ? 's' : '');
  }

  async function loadState() {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      tasks = {};
      for (const t of data.tasks) tasks[t.id] = t;

      if (data.plans && data.plans.length > 0) {
        const plan = data.plans[data.plans.length - 1];
        const badge = document.getElementById('planBadge');
        badge.textContent = plan.title;
        badge.style.display = 'inline';
      }

      renderAll();
    } catch {}
  }

  function connectSSE() {
    const dot = document.getElementById('liveDot');
    const es = new EventSource('/api/events');

    es.onopen = () => {
      dot.classList.remove('disconnected');
      if (sseRetryTimer) { clearTimeout(sseRetryTimer); sseRetryTimer = null; }
    };

    es.addEventListener('task:created', e => {
      const task = JSON.parse(e.data);
      upsertTask(task);
    });

    es.addEventListener('task:updated', e => {
      const task = JSON.parse(e.data);
      upsertTask(task);
    });

    es.addEventListener('plan:created', e => {
      const plan = JSON.parse(e.data);
      const badge = document.getElementById('planBadge');
      badge.textContent = plan.title;
      badge.style.display = 'inline';
    });

    es.onerror = () => {
      dot.classList.add('disconnected');
      es.close();
      sseRetryTimer = setTimeout(connectSSE, 3000);
    };
  }

  loadState().then(connectSSE);
</script>
</body>
</html>`;
}
