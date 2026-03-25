import { RoomConfig } from '../types/room.types';

export const BAR_CONFIG: RoomConfig = {
  id: 'bar',
  name: 'Bar do Código',
  description: 'Onde o código flui como chope',
  orchestrator: {
    role: 'orchestrator',
    name: 'Bartender',
    systemPromptPrefix: `Você é um bartender experiente e eficiente. Use gírias de bar naturalmente:
- Tasks são "pedidos"
- Tool calls são "buscar no estoque"
- Erros são "pedido errado"
- Conclusões são "pedido na mesa"
Seja casual mas preciso. Use "mano", "bora", "tranquilo" quando apropriado.`,
    taskMetaphor: 'pedido',
    toolMetaphor: 'busca no estoque',
    idleLines: [
      'Aguardando o próximo pedido...',
      'Limpando o balcão...',
      'Checando o estoque...',
    ],
  },
  subagents: [
    {
      role: 'researcher',
      name: 'Garçom',
      systemPromptPrefix: 'Você é o garçom, especialista em buscar informações rápido.',
      taskMetaphor: 'comanda',
      toolMetaphor: 'busca na cozinha',
      idleLines: ['Esperando comanda...', 'Limpando mesa...'],
    },
    {
      role: 'coder',
      name: 'Cozinheiro',
      systemPromptPrefix: 'Você é o cozinheiro, especialista em preparar código.',
      taskMetaphor: 'prato',
      toolMetaphor: 'ingrediente',
      idleLines: ['Preparando mise en place...', 'Afiando as ferramentas...'],
    },
    {
      role: 'reviewer',
      name: 'Sommelier',
      systemPromptPrefix: 'Você é o sommelier, especialista em revisar e garantir qualidade.',
      taskMetaphor: 'degustação',
      toolMetaphor: 'análise sensorial',
      idleLines: ['Degustando o código...', 'Analisando o bouquet...'],
    },
  ],
  kanban: {
    todo: 'Pedidos na Fila',
    doing: 'No Preparo',
    done: 'Servido',
    blocked: 'Sem Ingrediente',
    failed: 'Voltou Pra Cozinha',
  },
  visual: {
    bg: '#0a0600',
    floor: '#1f1006',
    accent: '#d4a054',
    wall: '#2d1a08',
    light: '#ff9f2e',
    emoji: '🍺',
    tilePattern: 'wood',
    ambientObjects: [
      { type: 'bar_counter', isoX: 2, isoY: 0, width: 4 },
      { type: 'bar_stool', isoX: 2, isoY: 1, width: 1 },
      { type: 'bar_stool', isoX: 3, isoY: 1, width: 1 },
      { type: 'beer_tap', isoX: 4, isoY: 0, width: 1 },
    ],
  },
};
