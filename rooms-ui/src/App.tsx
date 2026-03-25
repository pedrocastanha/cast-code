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

const SpawnAgentForm: React.FC = () => {
  const activeRoomId = useRoomStore((s) => s.activeRoomId);
  const [isOpen, setIsOpen] = React.useState(false);
  const [tool, setTool] = React.useState('claude');
  const [name, setName] = React.useState('Engenheiro');
  const [spawning, setSpawning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSpawn = async () => {
    setSpawning(true);
    setError(null);
    try {
      const res = await fetch(`/rooms/${activeRoomId}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, name, color: '#4ade80' })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIsOpen(false);
    } catch (e) {
      setError((e as Error).message);
      console.error('[spawn]', e);
    } finally {
      setSpawning(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{ background: 'var(--bg-300)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginLeft: '12px' }}
      >
        + Add Agent
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '12px' }}>
      <input 
        value={name} 
        onChange={e => setName(e.target.value)} 
        placeholder="Role/Name" 
        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-100)', color: 'white' }}
      />
      <select 
        value={tool} 
        onChange={e => setTool(e.target.value)}
        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-100)', color: 'white' }}
      >
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="codex">Codex</option>
        <option value="kimi">Kimi</option>
        <option value="qwen">Qwen</option>
      </select>
      <button onClick={handleSpawn} disabled={spawning} style={{ background: 'var(--emerald)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: spawning ? 'not-allowed' : 'pointer', opacity: spawning ? 0.6 : 1 }}>
        {spawning ? 'Spawning...' : 'Spawn'}
      </button>
      <button onClick={() => setIsOpen(false)} style={{ background: 'var(--bg-300)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>X</button>
      {error && <span style={{ color: 'var(--red, #f87171)', fontSize: '12px' }}>{error}</span>}
    </div>
  );
};

export const App: React.FC = () => {
  const activeRoomConfig = useRoomStore((s) => s.activeRoomConfig);
  const instances = useRoomStore((s) => s.instances);
  const agents = useRoomStore((s) => s.agents);

  
  
  useRoomSSE({
    instanceId: 'all',
    enabled: true,
    baseUrl: import.meta.env.PROD ? '' : '',
  });

  return (
    <div className="room-layout">
      {}
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
          <SpawnAgentForm />
          <span className="stat" style={{ marginLeft: '16px' }}>{agents.length} agentes</span>
        </div>
      </header>

      {}
      <div className="room-main">
        {}
        <div className="room-canvas-container">
          <RoomCanvas />
        </div>

        {}
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
