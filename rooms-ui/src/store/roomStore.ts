import { create } from 'zustand';
import type {
  CastEvent,
  RoomAgent,
  RoomInstance,
  ChatMessage,
  ConnectionLine,
  AgentBubble,
  AgentVisualState,
} from '../types/room.types';
import type { RoomConfig } from '../types/room.types';
import { ROOM_CONFIGS } from '../configs';

export type { AgentVisualState, AgentBubble };

export interface RoomStore {

  activeRoomId: string;
  activeRoomConfig: RoomConfig | null;
  instances: Map<string, RoomInstance>;
  agents: RoomAgent[];
  messages: ChatMessage[];
  connectionLines: ConnectionLine[];
  events: CastEvent[];
  notifications: Array<{ id: string; content: string; timestamp: number; visible: boolean }>;


  dispatch: (event: CastEvent) => void;
  setRoom: (roomId: string) => void;
  addInstance: (instance: RoomInstance) => void;
  removeInstance: (instanceId: string) => void;
  clearMessages: () => void;
  addNotification: (content: string) => void;
  hideNotification: (id: string) => void;
}

const INSTANCE_COLORS = [
  '#38bdf8', 
  '#4ade80', 
  '#f472b6', 
  '#fb923c', 
  '#a78bfa', 
  '#facc15', 
];

function getInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

function getDefaultAgentPosition(agentIndex: number): { x: number; y: number } {
  
  const positions = [
    { x: 3, y: 3 },
    { x: 5, y: 2 },
    { x: 2, y: 4 },
    { x: 6, y: 4 },
    { x: 4, y: 5 },
  ];
  return positions[agentIndex % positions.length];
}

export const useRoomStore = create<RoomStore>((set) => ({
  activeRoomId: 'bar',
  activeRoomConfig: ROOM_CONFIGS.bar,
  instances: new Map(),
  agents: [],
  messages: [],
  connectionLines: [],
  events: [],
  notifications: [],

  dispatch: (event: CastEvent) =>
    set((state) => {
      const newState = { ...state };
      const instance = newState.instances.get(event.instanceId);

      // Se for mensagem do user, cria notificação em vez de agente
      if (event.type === 'agent.message.sent' && event.agentId === 'user') {
        const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const notification = {
          id,
          content: event.payload.message || '',
          timestamp: event.timestamp,
          visible: true,
        };
        
        setTimeout(() => {
          set((s) => ({
            notifications: s.notifications.map((n) =>
              n.id === id ? { ...n, visible: false } : n
            ),
          }));
        }, 5000);
        
        return {
          ...newState,
          notifications: [...newState.notifications, notification],
        };
      }


      let agentIdx = newState.agents.findIndex(
        (a) => a.id === event.agentId && a.instanceId === event.instanceId
      );

      // Cria o agente se não existir (para eventos bridge.connected e bridge.disconnected também)
      if (agentIdx === -1 && (event.type.startsWith('bridge.') || event.type.startsWith('agent.'))) {
        const agentCount = newState.agents.filter(
          (a) => a.instanceId === event.instanceId
        ).length;
        const pos = getDefaultAgentPosition(agentCount);
        const newAgent: RoomAgent = {
          id: event.agentId,
          name: event.payload.instanceName || event.agentId,
          role: 'bridge',
          instanceId: event.instanceId,
          instanceColor: instance?.color || getInstanceColor(agentCount),
          visualState: 'IDLE',
          bubble: {
            type: 'speech',
            text: '',
            visible: false,
            createdAt: Date.now(),
          },
          isoX: pos.x,
          isoY: pos.y,
          animTick: 0,
        };
        newState.agents = [...newState.agents, newAgent];
        agentIdx = newState.agents.length - 1;
      }

      if (agentIdx === -1) {
        return newState;
      }

      const agent = { ...newState.agents[agentIdx] };

      // Atualiza estado visual do agente baseado no evento
      switch (event.type) {
        case 'bridge.connected':
          agent.visualState = 'IDLE';
          agent.name = event.payload.name as string || agent.name;
          agent.bubble = {
            type: 'speech',
            text: 'Online!',
            visible: true,
            createdAt: Date.now(),
          };
          setTimeout(() => {
            set((s) => {
              const idx = s.agents.findIndex((a) => a.instanceId === event.instanceId);
              if (idx === -1) return s;
              const updated = { ...s.agents[idx], bubble: { ...s.agents[idx].bubble, visible: false } };
              return {
                agents: [...s.agents.slice(0, idx), updated, ...s.agents.slice(idx + 1)],
              };
            });
          }, 2000);
          break;

        case 'bridge.disconnected':
          agent.visualState = 'IDLE';
          agent.bubble = {
            type: 'speech',
            text: 'Offline',
            visible: true,
            createdAt: Date.now(),
          };
          break;

        case 'agent.thinking':
          agent.visualState = 'THINKING';
          agent.bubble = {
            type: 'thought',
            text: '...',
            visible: true,
            createdAt: Date.now(),
          };
          break;

        case 'agent.task.started':
          agent.visualState = 'WORKING';
          agent.bubble = { ...agent.bubble, visible: false };
          break;

        case 'agent.tool.called':
          agent.visualState = 'TOOL_USE';
          agent.bubble = {
            type: 'tool',
            text: event.payload.toolName || 'tool',
            visible: true,
            createdAt: Date.now(),
          };
          break;

        case 'agent.message.sent': {
          agent.visualState = 'TALKING';
          const text = (event.payload.message || '').slice(0, 60);
          agent.bubble = {
            type: 'speech',
            text,
            visible: true,
            createdAt: Date.now(),
          };


          if (event.payload.toAgentId) {
            newState.connectionLines = [
              ...newState.connectionLines,
              {
                fromAgentId: event.agentId,
                toAgentId: event.payload.toAgentId,
                createdAt: Date.now(),
              },
            ];
          }


          newState.messages = [
            ...newState.messages,
            {
              id: event.id,
              agentId: event.agentId,
              agentName: agent.name,
              instanceId: event.instanceId,
              instanceColor: instance?.color || '#888',
              content: event.payload.message || '',
              type: event.source === 'bridge' ? 'bridge' : 'message',
              timestamp: event.timestamp,
            },
          ];
          break;
        }

        case 'agent.task.completed':
          agent.visualState = 'CELEBRATING';
          agent.bubble = {
            type: 'speech',
            text: '✓',
            visible: true,
            createdAt: Date.now(),
          };
          break;

        case 'agent.task.failed':
          agent.visualState = 'THINKING';
          agent.bubble = {
            type: 'speech',
            text: '✗',
            visible: true,
            createdAt: Date.now(),
          };
          break;

        case 'agent.idle':
          agent.visualState = 'IDLE';
          agent.bubble = { ...agent.bubble, visible: false };
          break;
      }

      newState.agents = [
        ...newState.agents.slice(0, agentIdx),
        agent,
        ...newState.agents.slice(agentIdx + 1),
      ];


      newState.events = [...newState.events.slice(-499), event];

      return newState;
    }),

  setRoom: (roomId) =>
    set({
      activeRoomId: roomId,
      activeRoomConfig: ROOM_CONFIGS[roomId] || null,
    }),

  addInstance: (instance) =>
    set((state) => {
      const next = new Map(state.instances);
      next.set(instance.id, instance);

      
      const updatedAgents = state.agents.map((agent) => {
        if (agent.instanceId === instance.id) {
          return {
            ...agent,
            instanceColor: instance.color,
            name: agent.name === agent.id ? instance.name : agent.name,
          };
        }
        return agent;
      });

      return {
        instances: next,
        agents: updatedAgents,
      };
    }),

  removeInstance: (instanceId) =>
    set((state) => {
      const next = new Map(state.instances);
      next.delete(instanceId);
      return {
        instances: next,
        agents: state.agents.filter((a) => a.instanceId !== instanceId),
        messages: state.messages.filter((m) => m.instanceId !== instanceId),
      };
    }),

  clearMessages: () => set({ messages: [] }),

  addNotification: (content) =>
    set((state) => {
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const notification = { id, content, timestamp: Date.now(), visible: true };
      
      setTimeout(() => {
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, visible: false } : n
          ),
        }));
      }, 5000);

      return {
        notifications: [...state.notifications, notification],
      };
    }),

  hideNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, visible: false } : n
      ),
    })),
}));
