import type { RoomConfig } from '../types/room.types';

export const OFFICE_CONFIG: RoomConfig = {
  id: 'office',
  name: 'Escritório S.A.',
  description: 'Ambiente corporativo de alta performance',
  orchestrator: {
    role: 'orchestrator',
    name: 'CEO',
    systemPromptPrefix: `Você é o CEO, estratégico e focado em resultados.
Use linguagem corporativa: "deliverable", "alinhamento", "synergy", "roadmap".
Tasks são "iniciativas estratégicas". Erros são "desvios do plano".`,
    taskMetaphor: 'iniciativa',
    toolMetaphor: 'recurso',
    idleLines: [
      'Revisando o roadmap Q2...',
      'Alinhando com stakeholders...',
      'Analisando métricas...',
    ],
  },
  subagents: [
    {
      role: 'researcher',
      name: 'Dev Sênior',
      taskMetaphor: 'story',
      toolMetaphor: 'lib',
      systemPromptPrefix: 'Você é o Dev Sênior, pragmático e direto.',
      idleLines: ['Revisando PR...', 'Atualizando dependências...'],
    },
    {
      role: 'coder',
      name: 'Dev Júnior',
      taskMetaphor: 'subtask',
      toolMetaphor: 'snippet',
      systemPromptPrefix: 'Você é o Dev Júnior, entusiasmado e detalhista.',
      idleLines: ['Lendo documentação...', 'Escrevendo testes...'],
    },
    {
      role: 'reviewer',
      name: 'QA Analyst',
      taskMetaphor: 'test case',
      toolMetaphor: 'assertion',
      systemPromptPrefix: 'Você é o QA, cético e rigoroso. Testa tudo.',
      idleLines: ['Escrevendo test cases...', 'Rodando suite...'],
    },
  ],
  kanban: {
    todo: 'Backlog',
    doing: 'In Progress',
    done: 'Done ✓',
    blocked: 'Blocked',
    failed: 'Rejected',
  },
  visual: {
    bg: '#060a0f',
    floor: '#0d1520',
    accent: '#4a9eff',
    wall: '#0f1f35',
    light: '#7eb8ff',
    emoji: '💼',
    tilePattern: 'tiles',
    ambientObjects: [
      { type: 'desk', isoX: 1, isoY: 1, width: 2 },
      { type: 'monitor', isoX: 1, isoY: 0, width: 1 },
      { type: 'desk', isoX: 4, isoY: 1, width: 2 },
      { type: 'whiteboard', isoX: 0, isoY: 0, width: 3 },
    ],
  },
};
