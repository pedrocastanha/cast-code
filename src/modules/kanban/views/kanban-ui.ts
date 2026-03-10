export function getKanbanHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cast Code</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌰</text></svg>">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Premium Dark Mode Colors */
    --bg: #09090b;
    --surface: rgba(24, 24, 27, 0.6);
    --surface-solid: #18181b;
    --card: rgba(39, 39, 42, 0.5);
    --border: rgba(255, 255, 255, 0.1);
    --border-hover: rgba(255, 255, 255, 0.2);
    --text: #fafafa;
    --muted: #a1a1aa;
    
    /* Status Colors */
    --cyan: #38bdf8;
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --orange: #fb923c;
    --purple: #c084fc;
    --teal: #2dd4bf; /* For TEST status */
    
    /* Effects */
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --glow: 0 0 20px -5px;
  }

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

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    flex-shrink: 0;
    z-index: 10;
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

  .btn-primary {
    background: var(--cyan);
    color: #000;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
    background: #7dd3fc;
  }

  .btn-primary:active {
    transform: translateY(1px);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
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

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal {
    background: var(--surface-solid);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 100%;
    max-width: 450px;
    padding: 24px;
    box-shadow: var(--shadow-lg), 0 0 40px rgba(0,0,0,0.5);
    transform: translateY(20px);
    animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes modalIn {
    to { transform: translateY(0); }
  }

  .modal-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 20px;
    color: var(--cyan);
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 6px;
    font-weight: 600;
  }

  .form-group input, .form-group textarea {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 8px 12px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
  }

  .form-group input:focus, .form-group textarea:focus {
    border-color: var(--cyan);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .btn-ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-ghost:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }

  .board {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
    padding: 24px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .column {
    background: var(--surface);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.3s ease;
    box-shadow: var(--shadow-md);
  }

  .column.drag-over {
    background: rgba(56, 189, 248, 0.08);
    border-color: var(--cyan);
    transform: scale(1.01);
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
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .col-pending .column-label { color: var(--muted); }
  .col-inprogress .column-label { color: var(--orange); }
  .col-test .column-label { color: var(--teal); }
  .col-done .column-label { color: var(--green); }
  .col-failed .column-label { color: var(--red); }

  .col-inprogress { border-top: 3px solid var(--orange); }
  .col-test { border-top: 3px solid var(--teal); }
  .col-done { border-top: 3px solid var(--green); }
  .col-failed { border-top: 3px solid var(--red); }
  .col-pending { border-top: 3px solid var(--border); }

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
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 50px;
  }

  .cards::-webkit-scrollbar { width: 6px; }
  .cards::-webkit-scrollbar-track { background: transparent; }
  .cards::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  .cards::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    cursor: grab;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    animation: cardIn 0.3s ease-out;
    position: relative;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .card:active {
    cursor: grabbing;
  }

  .card.dragging {
    opacity: 0.6;
    transform: scale(0.98) rotate(1deg);
    box-shadow: var(--shadow-lg);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card:hover {
    border-color: var(--border-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .card:hover .card-actions {
    opacity: 1;
    transform: translateY(0);
  }

  .card-actions {
    position: absolute;
    top: 10px;
    right: 10px;
    opacity: 0;
    transform: translateY(-4px);
    transition: all 0.2s ease;
  }

  .btn-mini {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--cyan);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
    text-transform: uppercase;
  }

  .btn-mini:hover {
    border-color: var(--cyan);
  }

  .btn-mini:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    padding-right: 40px;
  }

  .card-id {
    color: var(--muted);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .card-subject {
    font-weight: 500;
    font-size: 13px;
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

  .card-note {
    font-size: 11px;
    line-height: 1.5;
    color: var(--text);
    margin-bottom: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(56, 189, 248, 0.15);
    background: rgba(56, 189, 248, 0.06);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .card-note.error {
    color: #fecaca;
    border-color: rgba(248, 113, 113, 0.2);
    background: rgba(248, 113, 113, 0.08);
  }

  .card-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .badge-pending { background: rgba(161, 161, 170, 0.1); color: var(--muted); border: 1px solid rgba(161, 161, 170, 0.2); }
  .badge-in_progress { background: rgba(251, 146, 60, 0.1); color: var(--orange); border: 1px solid rgba(251, 146, 60, 0.2); }
  .badge-test { background: rgba(45, 212, 191, 0.1); color: var(--teal); border: 1px solid rgba(45, 212, 191, 0.2); }
  .badge-completed { background: rgba(74, 222, 128, 0.1); color: var(--green); border: 1px solid rgba(74, 222, 128, 0.2); }
  .badge-failed { background: rgba(248, 113, 113, 0.1); color: var(--red); border: 1px solid rgba(248, 113, 113, 0.2); }
  .badge-blocked { background: rgba(250, 204, 21, 0.1); color: var(--yellow); border: 1px solid rgba(250, 204, 21, 0.2); }
  .badge-cancelled { background: rgba(161, 161, 170, 0.1); color: var(--muted); border: 1px solid rgba(161, 161, 170, 0.2); }

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

  .thinking-indicator {
    color: var(--purple);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
</head>
<body>

<header>
  <div class="logo">cast <span>·</span> kanban</div>
  <div class="live-dot" id="liveDot"></div>
  <div id="header-right-container" class="header-right">
    <button class="btn-primary" onclick="showModal()">+ New Task</button>
    <span class="task-count" id="taskCount">0 tasks</span>
    <span class="plan-badge" id="planBadge" style="display:none"></span>
  </div>
</header>

<div class="board">
  <div class="column col-pending" id="col-pending" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'pending')">
    <div class="column-header">
      <span class="column-label">To-Do</span>
      <button id="btn-auto-planner" class="btn-mini" style="margin-left: 10px; border-color: var(--purple); color: var(--purple);" onclick="runAutoPlanner()">⚡ Run</button>
      <span class="column-count" id="count-pending">0</span>
    </div>
    <div class="cards" id="cards-pending"></div>
  </div>
  <div class="column col-inprogress" id="col-inprogress" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'in_progress')">
    <div class="column-header">
      <span class="column-label">In Progress</span>
      <span class="column-count" id="count-inprogress">0</span>
    </div>
    <div class="cards" id="cards-inprogress"></div>
  </div>
  <div class="column col-test" id="col-test" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'test')">
    <div class="column-header">
      <span class="column-label">Test</span>
      <span class="column-count" id="count-test">0</span>
    </div>
    <div class="cards" id="cards-test"></div>
  </div>
  <div class="column col-done" id="col-done" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'completed')">
    <div class="column-header">
      <span class="column-label">Done</span>
      <span class="column-count" id="count-done">0</span>
    </div>
    <div class="cards" id="cards-done"></div>
  </div>
  <div class="column col-failed" id="col-failed" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'failed')">
    <div class="column-header">
      <span class="column-label">Failed / Blocked</span>
      <span class="column-count" id="count-failed">0</span>
    </div>
    <div class="cards" id="cards-failed"></div>
  </div>
</div>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-title">Create New Task</div>
    <div class="form-group">
      <label>Subject</label>
      <input type="text" id="taskSubject" placeholder="What needs to be done?">
    </div>
    <div class="form-group">
      <label>Description (Optional)</label>
      <textarea id="taskDescription" rows="3" placeholder="Add more details..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="hideModal()">Cancel</button>
      <button class="btn-primary" onclick="createTask()">Create Task</button>
    </div>
  </div>
</div>

<script>
  const COL_MAP = {
    pending: 'pending',
    in_progress: 'inprogress',
    test: 'test',
    completed: 'done',
    failed: 'failed',
    blocked: 'failed',
    cancelled: 'failed',
  };

  let tasks = {};
  let sseRetryTimer = null;
  let isAutoPlanning = false;

  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() { timer = null; fn.apply(null, args); }, delay);
    };
  }
  const debouncedRenderAll = debounce(renderAll, 50);

  // Drag and Drop State
  let draggedTaskId = null;

  function handleDragStart(e, taskId) {
    draggedTaskId = taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTaskId = null;
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  async function handleDrop(e, targetStatus) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks[taskId];
    
    if (!task || task.status === targetStatus) return;

    // Rules
    if (task.status === 'completed' && targetStatus === 'in_progress') {
      const reason = prompt(\`Why are you redoing task "\${task.subject}"?\`);
      if (!reason) return;
      
      await updateTask(taskId, { 
        status: targetStatus,
        metadata: { ...task.metadata, redoReason: reason, redoneAt: Date.now() }
      });
    } else {
      await updateTask(taskId, { status: targetStatus });
    }
  }

  async function runAutoPlanner() {
    if (isAutoPlanning) return;
    isAutoPlanning = true;
    renderHeaderRight();
    document.getElementById('btn-auto-planner').disabled = true;

    try {
      await fetch('/api/tasks/auto-execute', { method: 'POST' });
    } catch (err) {
      console.error('Failed to start auto-planner:', err);
      isAutoPlanning = false;
      renderHeaderRight();
      document.getElementById('btn-auto-planner').disabled = false;
    }
  }

  function renderHeaderRight() {
    const container = document.getElementById('header-right-container');
    const thinking = isAutoPlanning ? '<span class="thinking-indicator"><div class="spinner" style="border-top-color:var(--purple)"></div> Auto-Planner thinking...</span>' : '';
    
    container.innerHTML = \`
      \${thinking}
      <button class="btn-primary" onclick="showModal()">+ New Task</button>
      <span class="task-count" id="taskCount">\${Object.keys(tasks).length} tasks</span>
      <span class="plan-badge" id="planBadge" style="display:none"></span>
    \`;
  }

  function showModal() {
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('taskSubject').focus();
  }

  function hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById('taskSubject').value = '';
    document.getElementById('taskDescription').value = '';
  }

  async function createTask() {
    const subject = document.getElementById('taskSubject').value.trim();
    const description = document.getElementById('taskDescription').value.trim();

    if (!subject) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, description })
      });
      
      if (res.ok) {
        hideModal();
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  async function updateTask(taskId, updates) {
    try {
      await fetch(\`/api/tasks/\${taskId}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  }

  async function executeTask(taskId) {
    try {
      await fetch(\`/api/tasks/\${taskId}/execute\`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to execute task:', err);
    }
  }

  function col(status) {
    return COL_MAP[status] || 'pending';
  }

  function makeCard(task) {
    const colKey = col(task.status);
    const isInProgress = task.status === 'in_progress';
    const isPending = task.status === 'pending';
    const metadata = task.metadata || {};

    const depBadges = task.dependencies.length > 0
      ? task.dependencies.map(d => '<span class="badge badge-dep">↳ ' + d + '</span>').join('')
      : '';

    const agentBadge = task.assignedAgent
      ? '<span class="badge badge-agent">⬡ ' + task.assignedAgent + '</span>'
      : '';

    const spinner = isInProgress ? '<div class="spinner"></div>' : '';
    const note = metadata.lastRunError
      ? '<div class="card-note error">' + escHtml(metadata.lastRunError) + '</div>'
      : metadata.lastRunSummary
        ? '<div class="card-note">' + escHtml(metadata.lastRunSummary) + '</div>'
        : '';
    
    const actionBtn = isPending 
      ? \`<div class="card-actions"><button class="btn-mini" onclick="executeTask('\${task.id}')">Run</button></div>\` 
      : '';

    return \`
      <div class="card" 
           id="card-\${task.id}" 
           data-status="\${task.status}" 
           draggable="true" 
           onsubmit="return false;"
           ondragstart="handleDragStart(event, '\${task.id}')"
           ondragend="handleDragEnd(event)">
        \${actionBtn}
        <div class="card-top">
          \${spinner}
          <span class="card-id">\${task.id}</span>
          <span class="card-subject">\${escHtml(task.subject)}</span>
        </div>
        \${task.description ? '<div class="card-description">' + escHtml(task.description) + '</div>' : ''}
        \${note}
        <div class="card-footer">
          <span class="badge badge-\${task.status}">\${task.status.replace('_', ' ')}</span>
          \${agentBadge}
          \${depBadges}
        </div>
      </div>
    \`;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function renderAll() {
    requestAnimationFrame(function() {
      const cols = { pending: [], inprogress: [], test: [], done: [], failed: [] };
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
      renderHeaderRight();
    });
  }

  function upsertTask(task) {
    const existed = !!tasks[task.id];
    tasks[task.id] = task;

    if (task.status === 'in_progress' || task.status === 'completed' || task.status === 'test') {
        // If we get an update that is progress, stop showing auto-planner thinking
        if (isAutoPlanning) {
            isAutoPlanning = false;
            renderHeaderRight();
            document.getElementById('btn-auto-planner').disabled = false;
        }
    }

    if (existed) {
      const card = document.getElementById('card-' + task.id);
      const newColKey = col(task.status);

      if (card) {
        const currentContainer = card.parentElement;
        const targetContainer = document.getElementById('cards-' + newColKey);

        if (currentContainer !== targetContainer) {
          debouncedRenderAll();
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
        debouncedRenderAll();
      }
    } else {
      debouncedRenderAll();
    }
  }

  function updateCounts() {
    const cols = { pending: 0, inprogress: 0, test: 0, done: 0, failed: 0 };
    for (const task of Object.values(tasks)) {
      cols[col(task.status)]++;
    }
    for (const [key, count] of Object.entries(cols)) {
      document.getElementById('count-' + key).textContent = count;
    }
    renderHeaderRight();
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
