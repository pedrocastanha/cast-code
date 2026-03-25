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
  // Estado
  activeRoomId: string;
  activeRoomConfig: RoomConfig | null;
  instances: Map<string, RoomInstance>;
  agents: RoomAgent[];
  messages: ChatMessage[];
  connectionLines: ConnectionLine[];
  events: CastEvent[];

  // Actions
  dispatch: (event: CastEvent) => void;
  setRoom: (roomId: string) => void;
  addInstance: (instance: RoomInstance) => void;
  removeInstance: (instanceId: string) => void;
  clearMessages: () => void;
}

const INSTANCE_COLORS = [
  '#38bdf8', // azul
  '#4ade80', // verde
  '#f472b6', // rosa
  '#fb923c', // laranja
  '#a78bfa', // violeta
  '#facc15', // amarelo
];

function getInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

function getDefaultAgentPosition(agentIndex: number): { x: number; y: number } {
  // Posições iniciais dos agentes no grid isométrico
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

  dispatch: (event: CastEvent) =>
    set((state) => {
      const newState = { ...state };
      const instance = newState.instances.get(event.instanceId);

      // Cria agente se não existe
      let agentIdx = newState.agents.findIndex(
        (a) => a.id === event.agentId && a.instanceId === event.instanceId
      );

      if (agentIdx === -1) {
        // Novo agente
        const agentCount = newState.agents.filter(
          (a) => a.instanceId === event.instanceId
        ).length;
        const pos = getDefaultAgentPosition(agentCount);
        const newAgent: RoomAgent = {
          id: event.agentId,
          name: event.agentId,
          role: 'unknown',
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

      const agent = { ...newState.agents[agentIdx] };

      // Atualiza estado visual do agente baseado no evento
      switch (event.type) {
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

          // Adiciona linha de conexão se mensagem tem destino
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

          // Adiciona ao chat
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

      // Append ao log de eventos (máx 500)
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

      // Atualiza nome dos agentes desta instância
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
}));
