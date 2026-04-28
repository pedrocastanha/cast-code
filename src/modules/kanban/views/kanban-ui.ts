import { getCastBaseCss } from '../../../ui/cast-design/web-theme';

export function getKanbanHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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

  .kanban-shell {
    min-height: 100dvh;
    padding: 20px;
  }

  .kanban-terminal {
    width: min(1440px, 100%);
    min-height: calc(100dvh - 40px);
  }

  .kanban-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-mid);
    background: rgba(8, 20, 39, 0.72);
    flex-shrink: 0;
  }

  .kanban-header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .kanban-count,
  .thinking-indicator {
    color: var(--text-muted);
    font-size: var(--font-sm);
  }

  .thinking-indicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .plan-badge {
    display: none;
  }

  .btn-primary,
  .btn-ghost,
  .btn-mini {
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .btn-primary {
    border: 1px solid var(--accent-mid);
    background: var(--accent-mid);
    color: var(--bg-dark);
    padding: 8px 14px;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-strong);
    padding: 7px 12px;
  }

  .btn-mini {
    background: var(--bg-deep);
    color: var(--accent-mid);
    border: 1px solid var(--border-strong);
    padding: 4px 8px;
    font-size: var(--font-xs);
  }

  .board-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg-base);
  }

  .board {
    min-width: 1200px;
    display: grid;
    grid-template-columns: repeat(5, minmax(220px, 1fr));
    gap: 16px;
    padding: 18px;
    height: 100%;
  }

  .column {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: rgba(4, 11, 22, 0.86);
    border: 1px solid var(--border-strong);
    border-radius: var(--terminal-radius);
    overflow: hidden;
  }

  .column.drag-over {
    border-color: var(--accent-mid);
    background: rgba(14, 165, 233, 0.06);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-mid);
    background: var(--bg-dark);
  }

  .column-label {
    color: var(--accent-mid);
    font-size: var(--font-sm);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .column-count {
    margin-left: auto;
    color: var(--amber);
    font-size: var(--font-sm);
  }

  .cards {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    gap: 10px;
  }

  .card {
    display: grid;
    gap: 10px;
    padding: 12px;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: var(--panel-radius);
    cursor: grab;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .card:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }

  .card.dragging {
    opacity: 0.65;
    cursor: grabbing;
  }

  .card.highlight {
    border-color: var(--accent-mid);
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .card-id {
    color: var(--text-faint);
    font-size: var(--font-xs);
    flex-shrink: 0;
  }

  .card-subject {
    color: var(--accent-bright);
    font-size: var(--font-sm);
  }

  .card-description,
  .card-note {
    color: var(--text-muted);
    font-size: var(--font-sm);
    line-height: 1.6;
  }

  .card-note.error {
    color: var(--error);
  }

  .card-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: var(--pill-radius);
    border: 1px solid var(--border-strong);
    background: var(--bg-dark);
    color: var(--text-muted);
    font-size: var(--font-xs);
  }

  .badge-pending { color: var(--text-muted); }
  .badge-in_progress { color: var(--accent-mid); }
  .badge-test { color: var(--purple); }
  .badge-completed { color: var(--green); }
  .badge-failed,
  .badge-blocked,
  .badge-cancelled { color: var(--error); }
  .badge-agent { color: var(--amber); }
  .badge-dep { color: var(--purple); }

  .spinner {
    width: 10px;
    height: 10px;
    border: 2px solid rgba(56, 189, 248, 0.18);
    border-top-color: var(--accent-mid);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    color: var(--text-faint);
    font-size: var(--font-sm);
    text-align: center;
    padding: 20px 0;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(4, 11, 22, 0.7);
    padding: 20px;
  }

  .modal {
    width: min(480px, 100%);
    border: 1px solid var(--border-strong);
    border-radius: var(--terminal-radius);
    background: var(--bg-base);
    overflow: hidden;
  }

  .modal-body {
    padding: 18px;
  }

  .modal-title {
    color: var(--accent-mid);
    font-size: var(--font-md);
    margin-bottom: 18px;
  }

  .form-group {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
  }

  .form-group label {
    color: var(--text-muted);
    font-size: var(--font-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--accent-bright);
    padding: 10px 12px;
    outline: none;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    border-color: var(--accent-mid);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }

  @media (max-width: 900px) {
    .kanban-shell {
      padding: 12px;
    }

    .kanban-header {
      flex-wrap: wrap;
    }

    .kanban-header-right {
      margin-left: 0;
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
</head>
<body>
<div class="kanban-shell">
  <div class="cast-terminal kanban-terminal">
    <div class="cast-titlebar">
      <span class="cast-traffic" style="background: var(--traffic-red)"></span>
      <span class="cast-traffic" style="background: var(--traffic-amber)"></span>
      <span class="cast-traffic" style="background: var(--traffic-green)"></span>
      <div class="cast-tab">kanban</div>
      <div class="cast-titlebar-note">task execution board</div>
    </div>

    <header class="kanban-header">
      <div class="cast-icon">✦</div>
      <div>
        <div class="cast-brand-title" style="font-size: var(--font-md);">CAST CODE</div>
        <div class="cast-brand-subtitle">Kanban execution surface</div>
      </div>
      <span class="cast-pill"><span class="cast-status-dot online" id="liveDot"></span> live board</span>
      <div id="header-right-container" class="kanban-header-right">
        <button class="btn-primary" onclick="showModal()">+ New Task</button>
        <span class="kanban-count" id="taskCount">0 tasks</span>
        <span class="cast-pill plan-badge" id="planBadge"></span>
      </div>
    </header>

    <div class="board-wrap">
      <div class="board">
        <div class="column col-pending" id="col-pending" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, 'pending')">
          <div class="column-header">
            <span class="column-label">To-Do</span>
            <button id="btn-auto-planner" class="btn-mini" onclick="runAutoPlanner()">⚡ Run</button>
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
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <div class="cast-titlebar">
      <span class="cast-traffic" style="background: var(--traffic-red)"></span>
      <span class="cast-traffic" style="background: var(--traffic-amber)"></span>
      <span class="cast-traffic" style="background: var(--traffic-green)"></span>
      <div class="cast-tab">new-task</div>
    </div>
    <div class="modal-body">
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
  let draggedTaskId = null;

  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() { timer = null; fn.apply(null, args); }, delay);
    };
  }
  const debouncedRenderAll = debounce(renderAll, 50);

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

    if (task.status === 'completed' && targetStatus === 'in_progress') {
      const reason = prompt('Why are you redoing task "' + task.subject + '"?');
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
    container.innerHTML = thinking +
      '<button class="btn-primary" onclick="showModal()">+ New Task</button>' +
      '<span class="kanban-count" id="taskCount">' + Object.keys(tasks).length + ' tasks</span>' +
      '<span class="cast-pill plan-badge" id="planBadge" style="display:none"></span>';
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
      if (res.ok) hideModal();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  async function updateTask(taskId, updates) {
    try {
      await fetch('/api/tasks/' + taskId, {
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
      await fetch('/api/tasks/' + taskId + '/execute', { method: 'POST' });
    } catch (err) {
      console.error('Failed to execute task:', err);
    }
  }

  function col(status) {
    return COL_MAP[status] || 'pending';
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function makeCard(task) {
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
      ? '<div class="card-actions"><button class="btn-mini" onclick="executeTask(\\'' + task.id + '\\')">Run</button></div>'
      : '';

    return '<div class="card" id="card-' + task.id + '" data-status="' + task.status + '" draggable="true" onsubmit="return false;" ondragstart="handleDragStart(event, \\'' + task.id + '\\')" ondragend="handleDragEnd(event)">' +
      actionBtn +
      '<div class="card-top">' + spinner + '<span class="card-id">' + task.id + '</span><span class="card-subject">' + escHtml(task.subject) + '</span></div>' +
      (task.description ? '<div class="card-description">' + escHtml(task.description) + '</div>' : '') +
      note +
      '<div class="card-footer"><span class="badge badge-' + task.status + '">' + task.status.replace('_', ' ') + '</span>' + agentBadge + depBadges + '</div>' +
      '</div>';
  }

  function renderAll() {
    requestAnimationFrame(function() {
      const cols = { pending: [], inprogress: [], test: [], done: [], failed: [] };
      for (const task of Object.values(tasks)) cols[col(task.status)].push(task);
      for (const [key, list] of Object.entries(cols)) {
        const container = document.getElementById('cards-' + key);
        const count = document.getElementById('count-' + key);
        if (list.length === 0) container.innerHTML = '<div class="empty-state">—</div>';
        else container.innerHTML = list.map(makeCard).join('');
        count.textContent = list.length;
      }
      renderHeaderRight();
    });
  }

  function upsertTask(task) {
    const existed = !!tasks[task.id];
    tasks[task.id] = task;

    if (task.status === 'in_progress' || task.status === 'completed' || task.status === 'test') {
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
    for (const task of Object.values(tasks)) cols[col(task.status)]++;
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
        badge.style.display = 'inline-flex';
      }

      renderAll();
    } catch {}
  }

  function connectSSE() {
    const dot = document.getElementById('liveDot');
    const es = new EventSource('/api/events');

    es.onopen = () => {
      dot.classList.remove('offline');
      dot.classList.add('online');
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
      badge.style.display = 'inline-flex';
    });

    es.onerror = () => {
      dot.classList.remove('online');
      dot.classList.add('offline');
      es.close();
      sseRetryTimer = setTimeout(connectSSE, 3000);
    };
  }

  loadState().then(connectSSE);
</script>
</body>
</html>`;
}
