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

  .btn-primary {
    background: var(--cyan);
    color: var(--bg);
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 100%;
    max-width: 450px;
    padding: 24px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
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
    transition: background 0.2s;
  }

  .column.drag-over {
    background: rgba(88, 166, 255, 0.05);
    border-color: var(--cyan);
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
    min-height: 50px;
  }

  .cards::-webkit-scrollbar { width: 4px; }
  .cards::-webkit-scrollbar-track { background: transparent; }
  .cards::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: grab;
    transition: border-color 0.15s, transform 0.15s;
    animation: cardIn 0.2s ease-out;
    position: relative;
  }

  .card:active {
    cursor: grabbing;
  }

  .card.dragging {
    opacity: 0.4;
    transform: scale(0.95);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card:hover {
    border-color: var(--border-hover);
  }

  .card:hover .card-actions {
    opacity: 1;
  }

  .card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    opacity: 0;
    transition: opacity 0.2s;
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
    completed: 'done',
    failed: 'failed',
    blocked: 'failed',
    cancelled: 'failed',
  };

  let tasks = {};
  let sseRetryTimer = null;
  let isAutoPlanning = false;

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

    const depBadges = task.dependencies.length > 0
      ? task.dependencies.map(d => '<span class="badge badge-dep">↳ ' + d + '</span>').join('')
      : '';

    const agentBadge = task.assignedAgent
      ? '<span class="badge badge-agent">⬡ ' + task.assignedAgent + '</span>'
      : '';

    const spinner = isInProgress ? '<div class="spinner"></div>' : '';
    
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

    renderHeaderRight();
  }

  function upsertTask(task) {
    const existed = !!tasks[task.id];
    tasks[task.id] = task;

    if (task.status === 'in_progress' || task.status === 'completed') {
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
