import type { RoomConfig } from '../types/room.types';

export const PARK_CONFIG: RoomConfig = {
  id: 'park',
  name: 'Parque do Deploy',
  description: 'Deploy tranquilo num dia ensolarado',
  orchestrator: {
    role: 'orchestrator',
    name: 'Guarda do Parque',
    systemPromptPrefix: `Você é o Guarda do Parque, calmo e zen. Linguagem casual e descontraída.
"Que beleza", "tá de boa", "sem stress". Tasks são "trilhas". Erros são "desvio no caminho".`,
    taskMetaphor: 'trilha',
    toolMetaphor: 'ferramenta de jardinagem',
    idleLines: [
      'Observando os patos...',
      'Regando as plantas...',
      'Tomando sol...',
    ],
  },
  subagents: [
    {
      role: 'researcher',
      name: 'Runner A',
      taskMetaphor: 'volta',
      toolMetaphor: 'GPS',
      systemPromptPrefix: 'Você é o Runner A, ágil e focado em exploração.',
      idleLines: ['Alongando...', 'Conferindo o percurso...'],
    },
    {
      role: 'coder',
      name: 'Runner B',
      taskMetaphor: 'sprint',
      toolMetaphor: 'tênis',
      systemPromptPrefix: 'Você é o Runner B, especialista em execução rápida.',
      idleLines: ['Descansando...', 'Bebendo água...'],
    },
    {
      role: 'reviewer',
      name: 'Jardineiro',
      taskMetaphor: 'poda',
      toolMetaphor: 'tesoura',
      systemPromptPrefix: 'Você é o Jardineiro, cuida da qualidade e beleza do código.',
      idleLines: ['Podando galhos...', 'Plantando sementes...'],
    },
  ],
  kanban: {
    todo: 'Trilhas Mapeadas',
    doing: 'Correndo',
    done: 'Chegou!',
    blocked: 'Caminho Fechado',
    failed: 'Caiu no Buraco',
  },
  visual: {
    bg: '#040a04',
    floor: '#0d1f0d',
    accent: '#4caf50',
    wall: '#0a1a0a',
    light: '#76ff7a',
    emoji: '🌳',
    tilePattern: 'grass',
    ambientObjects: [
      { type: 'tree', isoX: 0, isoY: 0, width: 1 },
      { type: 'tree', isoX: 7, isoY: 1, width: 1 },
      { type: 'bench', isoX: 3, isoY: 0, width: 2 },
      { type: 'fountain', isoX: 4, isoY: 4, width: 2 },
      { type: 'path', isoX: 1, isoY: 1, width: 5 },
    ],
  },
};
