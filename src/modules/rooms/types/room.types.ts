export interface AgentPersona {
  role: 'orchestrator' | 'researcher' | 'coder' | 'reviewer' | 'specialist';
  name: string;
  systemPromptPrefix: string;
  taskMetaphor: string;
  toolMetaphor: string;
  idleLines: string[];
}

export interface RoomKanban {
  todo: string;
  doing: string;
  done: string;
  blocked: string;
  failed: string;
}

export interface AmbientObject {
  type: string;
  isoX: number;
  isoY: number;
  width: number;
}

export interface RoomVisual {
  bg: string;
  floor: string;
  accent: string;
  wall: string;
  light: string;
  emoji: string;
  tilePattern: 'checkerboard' | 'wood' | 'grass' | 'metal' | 'tiles';
  ambientObjects: AmbientObject[];
}

export interface RoomConfig {
  id: string;
  name: string;
  description: string;
  orchestrator: AgentPersona;
  subagents: AgentPersona[];
  kanban: RoomKanban;
  visual: RoomVisual;
}
