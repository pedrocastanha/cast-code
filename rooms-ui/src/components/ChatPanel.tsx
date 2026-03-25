import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRoomStore } from '../store/roomStore';
import type { ChatMessage as ChatMessageType, KanbanTask } from '../types/room.types';

const ChatMessage: React.FC<{ message: ChatMessageType }> = ({ message }) => {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`chat-message type-${message.type}`}
      style={{ borderLeftColor: message.type === 'bridge' ? 'var(--purple)' : message.instanceColor }}
    >
      <div className="chat-message-header">
        <span
          className="agent-name"
          style={{ color: message.instanceColor }}
        >
          {message.agentName}
        </span>
        <span className="message-time">{time}</span>
      </div>
      <div className="message-content">{message.content}</div>
    </div>
  );
};

const NewMessagesIndicator: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <div className="new-messages-indicator" onClick={onClick}>
      <span>Novas mensagens</span>
      <span className="indicator-arrow">↓</span>
    </div>
  );
};

export const ChatPanel: React.FC = () => {
  const messages = useRoomStore((s) => s.messages);
  const agents = useRoomStore((s) => s.agents);
  const activeRoomId = useRoomStore((s) => s.activeRoomId);
  const listRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  };

  useEffect(() => {
    if (!userScrolled && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, userScrolled]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || sending) return;

    setSending(true);
    try {
      // Se selecionou um agente específico, envia task para ele
      if (selectedAgent && selectedAgent !== 'all') {
        const res = await fetch(`/rooms/task/${selectedAgent}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: inputMessage,
            type: 'task',
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        // Broadcast para todos os agentes da room
        const res = await fetch(`/rooms/${activeRoomId}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: inputMessage,
            type: 'broadcast',
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      setInputMessage('');
    } catch (e) {
      console.error('[send message]', e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Mensagens</span>
        <span className="badge">{messages.length}</span>
      </div>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span>Nenhuma mensagem ainda</span>
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
      </div>

      {userScrolled && messages.length > 0 && (
        <NewMessagesIndicator
          onClick={() => {
            if (listRef.current) {
              listRef.current.scrollTop = listRef.current.scrollHeight;
              setUserScrolled(false);
            }
          }}
        />
      )}

      {/* Input para enviar mensagens */}
      <div className="chat-input-container">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="chat-agent-select"
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-100)',
            color: 'white',
            fontSize: '13px',
          }}
        >
          <option value="all">Todos os agentes</option>
          {agents.map((agent) => (
            <option key={agent.instanceId} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enviar task para os agentes..."
          rows={2}
          className="chat-input"
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-100)',
            color: 'white',
            resize: 'none',
            fontSize: '13px',
          }}
        />
        <button
          onClick={handleSendMessage}
          disabled={sending || !inputMessage.trim()}
          className="chat-send-btn"
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: 'none',
            background: sending || !inputMessage.trim() ? 'var(--bg-300)' : 'var(--purple)',
            color: 'white',
            cursor: sending || !inputMessage.trim() ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
};





export const KanbanMini: React.FC = () => {
  const events = useRoomStore((s) => s.events);
  const roomConfig = useRoomStore((s) => s.activeRoomConfig);

  
  const kanbanTasks = useMemo(() => {
    const tasks: Map<string, KanbanTask> = new Map();

    for (const event of events) {
      if (event.type === 'agent.task.started' && event.payload.taskId) {
        tasks.set(event.payload.taskId, {
          id: event.payload.taskId,
          subject: event.payload.taskSubject || '...',
          status: 'doing',
          agentId: event.agentId,
        });
      }
      if (event.type === 'agent.task.completed' && event.payload.taskId) {
        const t = tasks.get(event.payload.taskId);
        if (t) tasks.set(t.id, { ...t, status: 'done' });
      }
      if (event.type === 'agent.task.failed' && event.payload.taskId) {
        const t = tasks.get(event.payload.taskId);
        if (t) tasks.set(t.id, { ...t, status: 'failed' });
      }
    }

    return Array.from(tasks.values());
  }, [events]);

  const columns = [
    { key: 'doing', label: roomConfig?.kanban.doing || 'In Progress' },
    { key: 'done', label: roomConfig?.kanban.done || 'Done' },
    { key: 'failed', label: roomConfig?.kanban.failed || 'Failed' },
  ];

  return (
    <div className="kanban-mini">
      <div className="kanban-header">
        <span>Kanban</span>
      </div>
      <div className="kanban-columns">
        {columns.map((col) => {
          const colTasks = kanbanTasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-title">{col.label}</div>
              <div className="kanban-column-count">{colTasks.length}</div>
            </div>
          );
        })}
      </div>
      <div className="kanban-tasks">
        {kanbanTasks.slice(-5).map((task) => (
          <div key={task.id} className={`kanban-task status-${task.status}`}>
            <span className="kanban-task-subject">{task.subject}</span>
            <span className="kanban-task-status">{task.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
