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
  const listRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Detecta scroll manual do usuário
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  };

  // Auto-scroll quando chegam novas mensagens (só se usuário não scrollou para cima)
  useEffect(() => {
    if (!userScrolled && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, userScrolled]);

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
    </div>
  );
};

// ============================================
// KANBAN MINI COMPONENT
// ============================================

export const KanbanMini: React.FC = () => {
  const events = useRoomStore((s) => s.events);
  const roomConfig = useRoomStore((s) => s.activeRoomConfig);

  // Deriva estado do kanban a partir dos eventos
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
