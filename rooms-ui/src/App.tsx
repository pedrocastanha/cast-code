import React from 'react';
import { useRoomStore } from './store/roomStore';
import { useRoomSSE } from './hooks/useRoomSSE';
import { RoomCanvas, RoomSelector, ChatPanel, KanbanMini } from './components';
import './styles/variables.css';
import './App.css';

const InstanceBadge: React.FC<{
  name: string;
  color: string;
  source: 'native' | 'bridge';
}> = ({ name, color, source }) => {
  return (
    <div className="instance-badge" style={{ borderColor: color }}>
      <span className="instance-dot" style={{ backgroundColor: color }} />
      <span className="instance-name">{name}</span>
      {source === 'bridge' && <span className="instance-bridge">bridge</span>}
    </div>
  );
};

export const App: React.FC = () => {
  const activeRoomConfig = useRoomStore((s) => s.activeRoomConfig);
  const instances = useRoomStore((s) => s.instances);
  const agents = useRoomStore((s) => s.agents);

  // Conecta ao SSE do Room Server
  // Em produção, o proxy do Vite encaminha para localhost:3335
  useRoomSSE({
    instanceId: 'all',
    enabled: true,
    baseUrl: import.meta.env.PROD ? '' : '',
  });

  return (
    <div className="room-layout">
      {/* HEADER */}
      <header className="room-header">
        <div className="header-left">
          {activeRoomConfig && (
            <>
              <span className="header-emoji">{activeRoomConfig.visual.emoji}</span>
              <h1 className="header-title">{activeRoomConfig.name}</h1>
            </>
          )}
        </div>

        <div className="header-instances">
          {Array.from(instances.values()).map((instance) => (
            <InstanceBadge
              key={instance.id}
              name={instance.name}
              color={instance.color}
              source={instance.source}
            />
          ))}
          {instances.size === 0 && (
            <span className="header-no-instances">
              Aguardando instâncias...
            </span>
          )}
        </div>

        <div className="header-stats">
          <span className="stat">{agents.length} agentes</span>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="room-main">
        {/* CANVAS AREA */}
        <div className="room-canvas-container">
          <RoomCanvas />
        </div>

        {/* SIDEBAR */}
        <aside className="room-sidebar">
          <RoomSelector />
          <div className="sidebar-divider" />
          <ChatPanel />
          <div className="sidebar-divider" />
          <KanbanMini />
        </aside>
      </div>
    </div>
  );
};

export default App;
