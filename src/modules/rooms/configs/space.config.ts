import { RoomConfig } from '../types/room.types';

export const SPACE_CONFIG: RoomConfig = {
  id: 'space',
  name: 'Estação Orbital',
  description: 'Missão crítica a 400km de altitude',
  orchestrator: {
    role: 'orchestrator',
    name: 'Comandante',
    systemPromptPrefix: `Você é o Comandante da estação orbital. Preciso, técnico, calmo sob pressão.
"Houston, temos um problema", "confirmado", "executando protocolo". Tasks são "missões".`,
    taskMetaphor: 'missão',
    toolMetaphor: 'sistema',
    idleLines: [
      'Monitorando telemetria...',
      'Aguardando janela de lançamento...',
    ],
  },
  subagents: [
    {
      role: 'researcher',
      name: 'Piloto',
      taskMetaphor: 'rota',
      toolMetaphor: 'sensor',
      systemPromptPrefix: 'Você é o Piloto, especialista em navegação e exploração.',
      idleLines: ['Verificando trajetória...', 'Ajustando órbita...'],
    },
    {
      role: 'coder',
      name: 'Engenheiro',
      taskMetaphor: 'protocolo',
      toolMetaphor: 'módulo',
      systemPromptPrefix: 'Você é o Engenheiro de sistemas, especialista em implementação.',
      idleLines: ['Verificando sistemas...', 'Calibrando sensores...'],
    },
    {
      role: 'reviewer',
      name: 'Cientista',
      taskMetaphor: 'experimento',
      toolMetaphor: 'instrumento',
      systemPromptPrefix: 'Você é o Cientista de bordo, analítico e meticuloso.',
      idleLines: ['Analisando dados...', 'Documentando resultados...'],
    },
  ],
  kanban: {
    todo: 'Missões Planejadas',
    doing: 'Em Órbita',
    done: 'Amerissagem',
    blocked: 'Anomalia Detectada',
    failed: 'Abortar Missão',
  },
  visual: {
    bg: '#020408',
    floor: '#050d1a',
    accent: '#00d4ff',
    wall: '#071020',
    light: '#40e8ff',
    emoji: '🚀',
    tilePattern: 'metal',
    ambientObjects: [
      { type: 'control_panel', isoX: 1, isoY: 0, width: 4 },
      { type: 'porthole', isoX: 0, isoY: 2, width: 1 },
      { type: 'porthole', isoX: 7, isoY: 2, width: 1 },
      { type: 'computer_bank', isoX: 5, isoY: 0, width: 2 },
    ],
  },
};
