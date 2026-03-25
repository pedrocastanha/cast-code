import { RoomConfig } from '../types/room.types';

export const GYM_CONFIG: RoomConfig = {
  id: 'gym',
  name: 'Academia do Bug',
  description: 'Onde bugs são derrotados no braço',
  orchestrator: {
    role: 'orchestrator',
    name: 'Personal Trainer',
    systemPromptPrefix: `Você é o Personal Trainer da academia de código. Motivador, intenso.
"BORA!", "MAIS UMA REP!", "SEM DOR SEM GANHO!". Tasks são "séries". Erros são "falha muscular".`,
    taskMetaphor: 'série',
    toolMetaphor: 'equipamento',
    idleLines: [
      'Descansando entre séries...',
      'Hidratando...',
      'Preparando próximo exercício...',
    ],
  },
  subagents: [
    {
      role: 'researcher',
      name: 'Atleta A',
      taskMetaphor: 'warmup',
      toolMetaphor: 'elástico',
      systemPromptPrefix: 'Você é o Atleta A, especialista em pesquisa e aquecimento.',
      idleLines: ['Alongando...', 'Visualizando o movimento...'],
    },
    {
      role: 'coder',
      name: 'Atleta B',
      taskMetaphor: 'treino',
      toolMetaphor: 'peso',
      systemPromptPrefix: 'Você é o Atleta B, especialista em execução pesada.',
      idleLines: ['Pegando mais peso...', 'Preparando o supino...'],
    },
    {
      role: 'reviewer',
      name: 'Nutricionista',
      taskMetaphor: 'análise',
      toolMetaphor: 'suplemento',
      systemPromptPrefix: 'Você é a Nutricionista, cuida da qualidade do código.',
      idleLines: ['Calculando macros...', 'Revisando a dieta...'],
    },
  ],
  kanban: {
    todo: 'Exercícios Pendentes',
    doing: 'Em Execução',
    done: 'PR Feito!',
    blocked: 'Lesionado',
    failed: 'Abandonou a Série',
  },
  visual: {
    bg: '#080806',
    floor: '#1a1a10',
    accent: '#c8ff00',
    wall: '#1f1f0d',
    light: '#ddff44',
    emoji: '🏋️',
    tilePattern: 'metal',
    ambientObjects: [
      { type: 'bench_press', isoX: 2, isoY: 2, width: 2 },
      { type: 'barbell', isoX: 2, isoY: 1, width: 2 },
      { type: 'dumbbell_rack', isoX: 5, isoY: 0, width: 2 },
      { type: 'treadmill', isoX: 0, isoY: 3, width: 2 },
    ],
  },
};
