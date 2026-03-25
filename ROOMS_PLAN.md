# cast-code ROOMS — Plano de Ação Completo

| Campo | Valor |
|-------|-------|
| Projeto | cast-code v2 — Rooms Feature |
| Autor | Pedro |
| Stack | NestJS + Vite + React + Canvas API + SSE + EventEmitter2 |
| Duração | 4 fases / ~12 semanas |
| Objetivo | Interface visual multi-agente temática com bridge cross-terminal e LTM |

---

## Índice

1. [Contexto do Codebase Atual](#1-contexto-do-codebase-atual)
2. [Visão Geral da Feature](#2-visão-geral-da-feature)
3. [Design System](#3-design-system)
4. [As Salas — Especificação Completa](#4-as-salas--especificação-completa)
5. [Fase 1 — Event System](#5-fase-1--event-system)
6. [Fase 2 — Interface Visual](#6-fase-2--interface-visual)
7. [Fase 3 — Multi-Instâncias](#7-fase-3--multi-instâncias)
8. [Fase 3.5 — Cross-Terminal Bridge](#8-fase-35--cross-terminal-bridge)
9. [Fase 4 — Long Term Memory](#9-fase-4--long-term-memory)
10. [Estrutura Completa de Arquivos](#10-estrutura-completa-de-arquivos)
11. [Dependências](#11-dependências)
12. [Decisões Técnicas e Trade-offs](#12-decisões-técnicas-e-trade-offs)

---

## 1. Contexto do Codebase Atual

Antes de qualquer implementação, é necessário entender o que já existe para não duplicar nem quebrar.

### O que existe hoje

| Módulo | Localização | O que faz |
|--------|-------------|-----------|
| DeepAgentService | `src/modules/core/services/deep-agent.service.ts` | Loop de agente principal, streaming LLM, tool calls |
| KanbanServerService | `src/modules/kanban/services/kanban-server.service.ts` | Servidor HTTP na porta 3333, SSE de tasks, frontend HTML inline |
| RemoteServerService | `src/modules/remote/services/remote-server.service.ts` | Servidor HTTP na porta 3334, SSE de stdout, bridge ngrok |
| TaskManagementService | `src/modules/tasks/services/task-management.service.ts` | EventEmitter local, emite `task:created` e `task:updated` |
| MultiLlmService | `src/common/services/multi-llm.service.ts` | Abstração de providers: Anthropic, OpenAI, Ollama, Gemini, DeepSeek, Kimi |
| MemoryModule | `src/modules/memory/` | Memória de sessão/contexto (diferente do LTM que será criado) |

### O que NÃO existe hoje

- **Nenhum React frontend** — o frontend atual é HTML em string TypeScript (`kanban-ui.ts`)
- **Nenhum EventEmitter global** — o EventEmitter do `TaskManagementService` é local àquele módulo
- **Nenhuma SSE granular de agente** — o SSE do kanban só emite eventos de task, não de tool call/thinking/mensagem
- **Nenhum sistema multi-instância** — uma instância de `DeepAgentService` por vez
- **Nenhum LTM persistido entre sessões** — a memória atual vive na sessão

### Princípio de implementação

Tudo é construído **em cima do que existe, sem quebrar nada**. O kanban continua funcionando na porta 3333. O remote continua na 3334. O Rooms adiciona a porta 3335 e um módulo novo.

---

## 2. Visão Geral da Feature

O cast-code já é um agente autônomo de coding rodando via CLI. A Rooms Feature adiciona uma camada visual interativa — uma interface temática parecida com um jogo isométrico estilo Habbo Hotel, onde cada sala representa um contexto de trabalho e os agentes são personagens animados que reagem às tasks em tempo real.

### O diferencial real

Não é só visualização. A feature resolve um problema concreto: **você tem o cast rodando em um terminal, Claude Code em outro, Codex em outro — e não há forma de eles se comunicarem ou de você ver o que cada um está fazendo de forma consolidada.**

O Room Bridge cria um protocolo de comunicação cross-terminal onde qualquer ferramenta de IA pode se registrar como agente na sala e trocar mensagens com os outros.

### Fluxo macro

```
Terminal 1: cast rooms --serve          → inicia Room Server (porta 3335)
Terminal 2: cast bridge -- claude       → Claude Code conectado como agente
Terminal 3: cast bridge -- codex        → Codex conectado como agente
Browser:    localhost:5173/rooms        → UI com todos os agentes na mesma sala
```

---

## 3. Design System

### 3.1 Paleta de Cores — Global

```css
/* Base */
--bg:              #09090b;   /* zinc-950 — fundo principal */
--surface:         rgba(24, 24, 27, 0.85);   /* zinc-900 translúcido */
--surface-solid:   #18181b;   /* zinc-900 sólido */
--card:            rgba(39, 39, 42, 0.6);    /* zinc-800 translúcido */
--border:          rgba(255, 255, 255, 0.08);
--border-hover:    rgba(255, 255, 255, 0.15);
--text:            #fafafa;   /* zinc-50 */
--text-muted:      #a1a1aa;   /* zinc-400 */
--text-dim:        #52525b;   /* zinc-600 */

/* Accent */
--cyan:    #38bdf8;  /* sky-400 */
--green:   #4ade80;  /* green-400 */
--yellow:  #facc15;  /* yellow-400 */
--red:     #f87171;  /* red-400 */
--orange:  #fb923c;  /* orange-400 */
--purple:  #c084fc;  /* purple-400 */
--teal:    #2dd4bf;  /* teal-400 */

/* Instâncias (cores de identificação visual) */
--instance-1: #38bdf8;  /* azul */
--instance-2: #4ade80;  /* verde */
--instance-3: #f472b6;  /* rosa */
--instance-4: #fb923c;  /* laranja */
--instance-5: #a78bfa;  /* violeta */
--instance-6: #facc15;  /* amarelo */
```

### 3.2 Paletas por Sala

Cada sala tem sua própria paleta que substitui as cores base no canvas:

```css
/* Bar do Código */
--room-bar-bg:      #0a0600;
--room-bar-floor:   #1f1006;
--room-bar-accent:  #d4a054;
--room-bar-wall:    #2d1a08;
--room-bar-light:   #ff9f2e;

/* Escritório S.A. */
--room-office-bg:      #060a0f;
--room-office-floor:   #0d1520;
--room-office-accent:  #4a9eff;
--room-office-wall:    #0f1f35;
--room-office-light:   #7eb8ff;

/* Academia do Bug */
--room-gym-bg:      #080806;
--room-gym-floor:   #1a1a10;
--room-gym-accent:  #c8ff00;
--room-gym-wall:    #1f1f0d;
--room-gym-light:   #ddff44;

/* Parque do Deploy */
--room-park-bg:      #040a04;
--room-park-floor:   #0d1f0d;
--room-park-accent:  #4caf50;
--room-park-wall:    #0a1a0a;
--room-park-light:   #76ff7a;

/* Estação Orbital */
--room-space-bg:      #020408;
--room-space-floor:   #050d1a;
--room-space-accent:  #00d4ff;
--room-space-wall:    #071020;
--room-space-light:   #40e8ff;
```

### 3.3 Tipografia

```css
/* Sistema de fontes */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Para código e eventos */
font-family-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

/* Escala */
--text-xs:   11px;
--text-sm:   13px;
--text-base: 14px;
--text-md:   15px;
--text-lg:   18px;
--text-xl:   22px;

/* Peso */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;
```

### 3.4 Espaçamento e Grid

```css
/* Espaçamento (múltiplos de 4) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

/* Border radius */
--radius-sm:  4px;
--radius-md:  8px;
--radius-lg:  12px;
--radius-xl:  16px;
--radius-full: 9999px;

/* Layout principal */
--header-height:    52px;
--sidebar-width:    320px;   /* ChatPanel */
--canvas-min-width: 600px;
```

### 3.5 Animações e Transições

```css
/* Durações */
--duration-fast:   100ms;
--duration-normal: 200ms;
--duration-slow:   350ms;

/* Easings */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);    /* snappy */
--ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
--ease:     cubic-bezier(0.4, 0, 0.2, 1);      /* material */

/* Sombras com glow */
--shadow-glow-cyan:   0 0 20px -4px rgba(56, 189, 248, 0.4);
--shadow-glow-green:  0 0 20px -4px rgba(74, 222, 128, 0.4);
--shadow-card:        0 4px 24px rgba(0, 0, 0, 0.4);
```

---

## 4. As Salas — Especificação Completa

### Estrutura do RoomConfig

```typescript
// src/modules/rooms/types/room.types.ts

export interface AgentPersona {
  role: 'orchestrator' | 'researcher' | 'coder' | 'reviewer' | 'specialist'
  name: string
  systemPromptPrefix: string   // injetado antes de qualquer outro prompt
  taskMetaphor: string         // como o agente chama uma "task"
  toolMetaphor: string         // como o agente chama usar uma "tool"
  idleLines: string[]          // frases aleatórias no estado idle
}

export interface RoomKanban {
  todo: string    // nome da coluna "a fazer"
  doing: string   // nome da coluna "em andamento"
  done: string    // nome da coluna "concluído"
  blocked: string // nome da coluna "bloqueado"
  failed: string  // nome da coluna "falhou"
}

export interface RoomVisual {
  bg: string       // cor do fundo
  floor: string    // cor do piso isométrico
  accent: string   // cor de destaque (balões, borders)
  wall: string     // cor das paredes
  light: string    // cor das luzes ambiente
  emoji: string    // emoji da sala (usado no header)
  tilePattern: 'checkerboard' | 'wood' | 'grass' | 'metal' | 'tiles'
  ambientObjects: AmbientObject[]   // objetos decorativos no fundo
}

export interface AmbientObject {
  type: string    // 'bar_counter' | 'desk' | 'bench_press' | 'tree' | 'control_panel'
  isoX: number    // posição no grid isométrico
  isoY: number
  width: number   // em tiles
}

export interface RoomConfig {
  id: string
  name: string
  description: string
  orchestrator: AgentPersona
  subagents: AgentPersona[]
  kanban: RoomKanban
  visual: RoomVisual
}
```

### Sala 1 — Bar do Código

```typescript
// src/modules/rooms/configs/bar.config.ts
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
      systemPromptPrefix: `Você é o garçom, especialista em buscar informações rápido.`,
      taskMetaphor: 'comanda',
      toolMetaphor: 'busca na cozinha',
      idleLines: ['Esperando comanda...', 'Limpando mesa...'],
    },
    {
      role: 'coder',
      name: 'Cozinheiro',
      systemPromptPrefix: `Você é o cozinheiro, especialista em preparar código.`,
      taskMetaphor: 'prato',
      toolMetaphor: 'ingrediente',
      idleLines: ['Preparando mise en place...', 'Afiando as ferramentas...'],
    },
    {
      role: 'reviewer',
      name: 'Sommelier',
      systemPromptPrefix: `Você é o sommelier, especialista em revisar e garantir qualidade.`,
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
}
```

### Sala 2 — Escritório S.A.

```typescript
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
    { role: 'researcher', name: 'Dev Sênior', taskMetaphor: 'story', toolMetaphor: 'lib',
      systemPromptPrefix: 'Você é o Dev Sênior, pragmático e direto.',
      idleLines: ['Revisando PR...', 'Atualizando dependências...'] },
    { role: 'coder', name: 'Dev Júnior', taskMetaphor: 'subtask', toolMetaphor: 'snippet',
      systemPromptPrefix: 'Você é o Dev Júnior, entusiasmado e detalhista.',
      idleLines: ['Lendo documentação...', 'Escrevendo testes...'] },
    { role: 'reviewer', name: 'QA Analyst', taskMetaphor: 'test case', toolMetaphor: 'assertion',
      systemPromptPrefix: 'Você é o QA, cético e rigoroso. Testa tudo.',
      idleLines: ['Escrevendo test cases...', 'Rodando suite...'] },
  ],
  kanban: {
    todo: 'Backlog',
    doing: 'In Progress',
    done: 'Done ✓',
    blocked: 'Blocked',
    failed: 'Rejected',
  },
  visual: {
    bg: '#060a0f', floor: '#0d1520', accent: '#4a9eff',
    wall: '#0f1f35', light: '#7eb8ff', emoji: '💼',
    tilePattern: 'tiles',
    ambientObjects: [
      { type: 'desk', isoX: 1, isoY: 1, width: 2 },
      { type: 'monitor', isoX: 1, isoY: 0, width: 1 },
      { type: 'desk', isoX: 4, isoY: 1, width: 2 },
      { type: 'whiteboard', isoX: 0, isoY: 0, width: 3 },
    ],
  },
}
```

### Sala 3 — Academia do Bug

```typescript
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
    idleLines: ['Descansando entre séries...', 'Hidratando...', 'Preparando próximo exercício...'],
  },
  subagents: [
    { role: 'researcher', name: 'Atleta A', taskMetaphor: 'warmup', toolMetaphor: 'elástico',
      systemPromptPrefix: 'Você é o Atleta A, especialista em pesquisa e aquecimento.',
      idleLines: ['Alongando...', 'Visualizando o movimento...'] },
    { role: 'coder', name: 'Atleta B', taskMetaphor: 'treino', toolMetaphor: 'peso',
      systemPromptPrefix: 'Você é o Atleta B, especialista em execução pesada.',
      idleLines: ['Pegando mais peso...', 'Preparando o supino...'] },
    { role: 'reviewer', name: 'Nutricionista', taskMetaphor: 'análise', toolMetaphor: 'suplemento',
      systemPromptPrefix: 'Você é a Nutricionista, cuida da qualidade do código.',
      idleLines: ['Calculando macros...', 'Revisando a dieta...'] },
  ],
  kanban: {
    todo: 'Exercícios Pendentes',
    doing: 'Em Execução',
    done: 'PR Feito!',
    blocked: 'Lesionado',
    failed: 'Abandonou a Série',
  },
  visual: {
    bg: '#080806', floor: '#1a1a10', accent: '#c8ff00',
    wall: '#1f1f0d', light: '#ddff44', emoji: '🏋️',
    tilePattern: 'metal',
    ambientObjects: [
      { type: 'bench_press', isoX: 2, isoY: 2, width: 2 },
      { type: 'barbell', isoX: 2, isoY: 1, width: 2 },
      { type: 'dumbbell_rack', isoX: 5, isoY: 0, width: 2 },
      { type: 'treadmill', isoX: 0, isoY: 3, width: 2 },
    ],
  },
}
```

### Sala 4 — Parque do Deploy

```typescript
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
    idleLines: ['Observando os patos...', 'Regando as plantas...', 'Tomando sol...'],
  },
  subagents: [
    { role: 'researcher', name: 'Runner A', taskMetaphor: 'volta', toolMetaphor: 'GPS',
      systemPromptPrefix: 'Você é o Runner A, ágil e focado em exploração.',
      idleLines: ['Alongando...', 'Conferindo o percurso...'] },
    { role: 'coder', name: 'Runner B', taskMetaphor: 'sprint', toolMetaphor: 'tênis',
      systemPromptPrefix: 'Você é o Runner B, especialista em execução rápida.',
      idleLines: ['Descansando...', 'Bebendo água...'] },
    { role: 'reviewer', name: 'Jardineiro', taskMetaphor: 'poda', toolMetaphor: 'tesoura',
      systemPromptPrefix: 'Você é o Jardineiro, cuida da qualidade e beleza do código.',
      idleLines: ['Podando galhos...', 'Plantando sementes...'] },
  ],
  kanban: {
    todo: 'Trilhas Mapeadas',
    doing: 'Correndo',
    done: 'Chegou!',
    blocked: 'Caminho Fechado',
    failed: 'Caiu no Buraco',
  },
  visual: {
    bg: '#040a04', floor: '#0d1f0d', accent: '#4caf50',
    wall: '#0a1a0a', light: '#76ff7a', emoji: '🌳',
    tilePattern: 'grass',
    ambientObjects: [
      { type: 'tree', isoX: 0, isoY: 0, width: 1 },
      { type: 'tree', isoX: 7, isoY: 1, width: 1 },
      { type: 'bench', isoX: 3, isoY: 0, width: 2 },
      { type: 'fountain', isoX: 4, isoY: 4, width: 2 },
      { type: 'path', isoX: 1, isoY: 1, width: 5 },
    ],
  },
}
```

### Sala 5 — Estação Orbital

```typescript
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
    idleLines: ['Monitorando telemetria...', 'Aguardando janela de lançamento...'],
  },
  subagents: [
    { role: 'researcher', name: 'Piloto', taskMetaphor: 'rota', toolMetaphor: 'sensor',
      systemPromptPrefix: 'Você é o Piloto, especialista em navegação e exploração.',
      idleLines: ['Verificando trajetória...', 'Ajustando órbita...'] },
    { role: 'coder', name: 'Engenheiro', taskMetaphor: 'protocolo', toolMetaphor: 'módulo',
      systemPromptPrefix: 'Você é o Engenheiro de sistemas, especialista em implementação.',
      idleLines: ['Verificando sistemas...', 'Calibrando sensores...'] },
    { role: 'reviewer', name: 'Cientista', taskMetaphor: 'experimento', toolMetaphor: 'instrumento',
      systemPromptPrefix: 'Você é o Cientista de bordo, analítico e meticuloso.',
      idleLines: ['Analisando dados...', 'Documentando resultados...'] },
  ],
  kanban: {
    todo: 'Missões Planejadas',
    doing: 'Em Órbita',
    done: 'Amerissagem',
    blocked: 'Anomalia Detectada',
    failed: 'Abortar Missão',
  },
  visual: {
    bg: '#020408', floor: '#050d1a', accent: '#00d4ff',
    wall: '#071020', light: '#40e8ff', emoji: '🚀',
    tilePattern: 'metal',
    ambientObjects: [
      { type: 'control_panel', isoX: 1, isoY: 0, width: 4 },
      { type: 'porthole', isoX: 0, isoY: 2, width: 1 },
      { type: 'porthole', isoX: 7, isoY: 2, width: 1 },
      { type: 'computer_bank', isoX: 5, isoY: 0, width: 2 },
    ],
  },
}
```

---

## 5. Fase 1 — Event System

**Semanas 1–2.** Sem UI nova. Refactoring interno + infraestrutura de eventos.

### 5.1 Instalação

```bash
npm install eventemitter2
npm install --save-dev @types/eventemitter2
```

### 5.2 Tipos de Eventos

```typescript
// src/modules/rooms/types/event.types.ts

export type AgentEventType =
  | 'agent.task.started'
  | 'agent.task.completed'
  | 'agent.task.failed'
  | 'agent.tool.called'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.message.sent'
  | 'agent.message.received'
  | 'agent.thinking'
  | 'agent.idle'
  | 'instance.created'
  | 'instance.destroyed'
  | 'room.message'    // cross-terminal
  | 'bridge.connected'
  | 'bridge.disconnected'

export interface CastEvent {
  id: string             // UUID único do evento
  type: AgentEventType
  agentId: string        // "bartender", "garcom", "claude-bridge"
  instanceId: string     // UUID da instância
  roomId: string         // "bar" | "office" | "gym" | "park" | "space"
  source: 'native' | 'bridge'   // cast nativo ou bridge externo
  payload: {
    taskId?: string
    taskSubject?: string
    taskStatus?: string
    toolName?: string
    toolArgs?: Record<string, unknown>
    toolOutput?: string
    message?: string
    toAgentId?: string
    fromAgentId?: string
    traceId?: string
    tokens?: number
    latencyMs?: number
    error?: string
  }
  timestamp: number
}
```

### 5.3 RoomEventBusService

```typescript
// src/modules/rooms/services/room-event-bus.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { EventEmitter2 } from 'eventemitter2'

@Injectable()
export class RoomEventBusService implements OnModuleInit {
  private emitter: EventEmitter2
  private buffer: CastEvent[] = []
  private readonly BUFFER_SIZE = 200

  onModuleInit() {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    })
  }

  emit(event: CastEvent): void {
    // Adiciona ao buffer circular
    this.buffer.push(event)
    if (this.buffer.length > this.BUFFER_SIZE) {
      this.buffer.shift()
    }
    // Emite com wildcards — 'agent.task.started' dispara listeners de 'agent.*' e 'agent.task.*'
    this.emitter.emit(event.type, event)
    this.emitter.emit('*', event)
  }

  on(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.on(pattern, listener)
  }

  off(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.off(pattern, listener)
  }

  // Retorna eventos recentes para replay no momento de conexão SSE
  getRecentEvents(limit = 50): CastEvent[] {
    return this.buffer.slice(-limit)
  }

  // Filtra por instanceId ou roomId
  getRecentEventsFiltered(filter: { instanceId?: string; roomId?: string }, limit = 50): CastEvent[] {
    return this.buffer
      .filter(e => {
        if (filter.instanceId && filter.instanceId !== 'all' && e.instanceId !== filter.instanceId) return false
        if (filter.roomId && e.roomId !== filter.roomId) return false
        return true
      })
      .slice(-limit)
  }
}
```

### 5.4 Instrumentar o DeepAgentService

Injetar `RoomEventBusService` e emitir nos pontos do loop. O `DeepAgentService` já tem acesso a todos os momentos certos — só adiciona o emit sem mudar a lógica.

**Pontos de instrumentação (com base no código atual):**

```typescript
// No loop de streaming, antes de chamar tool:
this.eventBus.emit({
  id: crypto.randomUUID(),
  type: 'agent.tool.called',
  agentId: this.currentAgentId,
  instanceId: this.instanceId,
  roomId: this.roomId,
  source: 'native',
  payload: { toolName: toolCall.name, toolArgs: toolCall.args, traceId },
  timestamp: Date.now(),
})

// Após retorno de tool:
this.eventBus.emit({ type: 'agent.tool.completed', payload: { toolName, toolOutput: output.slice(0, 200) }, ...base })

// Quando streaming começa (thinking):
this.eventBus.emit({ type: 'agent.thinking', ...base })

// Quando task inicia (em executeTask ou handleAutoExecute):
this.eventBus.emit({ type: 'agent.task.started', payload: { taskId: task.id, taskSubject: task.subject }, ...base })

// Quando task conclui:
this.eventBus.emit({ type: 'agent.task.completed', payload: { taskId, tokens: this.tokenCount }, ...base })
```

O `base` é um objeto reutilizável:
```typescript
const base = {
  id: crypto.randomUUID(),
  agentId: this.currentAgentId ?? 'orchestrator',
  instanceId: this.instanceId ?? 'default',
  roomId: this.roomId ?? 'bar',
  source: 'native' as const,
  timestamp: Date.now(),
}
```

### 5.5 RoomSseService

```typescript
// src/modules/rooms/services/room-sse.service.ts

@Injectable()
export class RoomSseService implements OnModuleInit {
  private server: http.Server
  private clients: Map<string, { res: http.ServerResponse; filter: SseFilter }> = new Map()
  private readonly PORT = 3335

  constructor(private readonly eventBus: RoomEventBusService) {}

  onModuleInit() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
    this.server.listen(this.PORT)

    // Escuta TODOS os eventos e faz fan-out para clients SSE relevantes
    this.eventBus.on('*', (event: CastEvent) => this.fanout(event))
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://localhost:${this.PORT}`)
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/rooms/events' && req.method === 'GET') {
      const instanceId = url.searchParams.get('instanceId') ?? 'all'
      const roomId = url.searchParams.get('roomId') ?? undefined

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'retry': '3000',   // instrui o browser a reconectar após 3s se cair
      })

      const clientId = crypto.randomUUID()
      this.clients.set(clientId, { res, filter: { instanceId, roomId } })

      // Replay: envia eventos recentes para o cliente não começar em branco
      const recent = this.eventBus.getRecentEventsFiltered({ instanceId, roomId })
      for (const event of recent) {
        res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }

      req.on('close', () => this.clients.delete(clientId))
      return
    }

    // Outros endpoints (instances, bridge) são tratados aqui também
    res.writeHead(404)
    res.end()
  }

  private fanout(event: CastEvent) {
    const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    for (const [, client] of this.clients) {
      const { res, filter } = client
      if (filter.instanceId !== 'all' && filter.instanceId !== event.instanceId) continue
      if (filter.roomId && filter.roomId !== event.roomId) continue
      try { res.write(payload) } catch { }
    }
  }
}
```

### 5.6 Critério de Conclusão da Fase 1

```bash
# Terminal 1 — cast rodando com uma task
cast

# Terminal 2 — verificação
curl -N "http://localhost:3335/rooms/events?instanceId=all" | jq

# Saída esperada:
# {"id":"...","type":"agent.thinking","agentId":"orchestrator",...}
# {"id":"...","type":"agent.tool.called","payload":{"toolName":"read_file"},...}
# {"id":"...","type":"agent.task.completed",...}
```

---

## 6. Fase 2 — Interface Visual

**Semanas 3–6.** A fase mais extensa. Todo o frontend React.

### 6.1 Setup do Projeto Vite + React

```bash
cd cast-code/
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install zustand react-router-dom
# Sem Phaser, sem PixiJS, sem Konva — Canvas API pura
```

**`frontend/vite.config.ts`:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/rooms': {
        target: 'http://localhost:3335',
        changeOrigin: true,
        ws: false,   // SSE não é WebSocket
      },
    },
  },
  build: {
    outDir: '../src/modules/rooms/static',  // NestJS serve em produção
  },
})
```

**`frontend/tsconfig.json`:** strict mode ligado, `paths` configurado para `@/`.

### 6.2 Layout Geral — Especificação Pixel a Pixel

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER (height: 52px, bg: --surface, blur: 12px, border-bottom)     │
│ [🍺 Bar do Código] [──────] [● Claude] [● cast] [● Codex] [+ Nova] │
└─────────────────┬───────────────────────────────────┬───────────────┘
                  │                                   │
┌─────────────────┴──────────────────┐  ┌────────────┴────────────────┐
│                                    │  │ CHAT PANEL (width: 320px)   │
│  CANVAS ISOMÉTRICO                 │  │ bg: --surface               │
│  (flex: 1, min-width: 600px)       │  │                             │
│                                    │  │ Messages list               │
│  bg: room.visual.bg                │  │ com scroll inteligente      │
│                                    │  │                             │
│                                    │  ├─────────────────────────────┤
│                                    │  │ KANBAN MINI (height: 160px) │
│                                    │  │ 3 colunas temáticas         │
└────────────────────────────────────┘  └─────────────────────────────┘
```

**CSS Grid do layout:**

```css
.room-layout {
  display: grid;
  grid-template-rows: 52px 1fr;
  grid-template-columns: 1fr 320px;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

.room-header    { grid-column: 1 / -1; }
.room-canvas    { grid-column: 1; grid-row: 2; }
.room-sidebar   { grid-column: 2; grid-row: 2; display: flex; flex-direction: column; }
```

### 6.3 Zustand Store

```typescript
// frontend/src/store/roomStore.ts
import { create } from 'zustand'

export type AgentVisualState = 'IDLE' | 'THINKING' | 'WORKING' | 'TOOL_USE' | 'TALKING' | 'CELEBRATING'

export interface AgentBubble {
  type: 'speech' | 'thought' | 'tool'
  text: string
  visible: boolean
  createdAt: number
}

export interface RoomAgent {
  id: string
  name: string
  role: string
  instanceId: string
  instanceColor: string
  visualState: AgentVisualState
  bubble: AgentBubble
  isoX: number    // posição no grid isométrico
  isoY: number
  animTick: number   // frame da animação atual
}

export interface RoomInstance {
  id: string
  name: string
  model: string
  provider: string
  roomId: string
  color: string
  status: 'connecting' | 'active' | 'idle' | 'error'
  source: 'native' | 'bridge'
  bridgeTool?: string   // 'claude' | 'codex' | 'qwen' | 'gemini'
}

export interface ChatMessage {
  id: string
  agentId: string
  agentName: string
  instanceId: string
  instanceColor: string
  content: string
  type: 'message' | 'tool_call' | 'task_event' | 'bridge'
  timestamp: number
}

export interface ConnectionLine {
  fromAgentId: string
  toAgentId: string
  createdAt: number
}

interface RoomStore {
  // Estado
  activeRoomId: string
  activeRoomConfig: RoomConfig | null
  instances: Map<string, RoomInstance>
  agents: RoomAgent[]
  messages: ChatMessage[]
  connectionLines: ConnectionLine[]
  events: CastEvent[]

  // Actions
  dispatch: (event: CastEvent) => void
  setRoom: (roomId: string) => void
  addInstance: (instance: RoomInstance) => void
  removeInstance: (instanceId: string) => void
  clearMessages: () => void
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  activeRoomId: 'bar',
  activeRoomConfig: BAR_CONFIG,
  instances: new Map(),
  agents: [],
  messages: [],
  connectionLines: [],
  events: [],

  dispatch: (event) => set((state) => {
    const newState = { ...state }

    // Atualiza estado visual do agente
    const agentIdx = newState.agents.findIndex(
      a => a.id === event.agentId && a.instanceId === event.instanceId
    )

    if (agentIdx >= 0) {
      const agent = { ...newState.agents[agentIdx] }

      switch (event.type) {
        case 'agent.thinking':
          agent.visualState = 'THINKING'
          agent.bubble = { type: 'thought', text: '...', visible: true, createdAt: Date.now() }
          break

        case 'agent.task.started':
          agent.visualState = 'WORKING'
          agent.bubble = { ...agent.bubble, visible: false }
          break

        case 'agent.tool.called':
          agent.visualState = 'TOOL_USE'
          agent.bubble = {
            type: 'tool',
            text: event.payload.toolName ?? 'tool',
            visible: true,
            createdAt: Date.now(),
          }
          break

        case 'agent.message.sent': {
          agent.visualState = 'TALKING'
          const text = (event.payload.message ?? '').slice(0, 60)
          agent.bubble = { type: 'speech', text, visible: true, createdAt: Date.now() }

          // Adiciona linha de conexão se mensagem tem destino
          if (event.payload.toAgentId) {
            newState.connectionLines = [
              ...newState.connectionLines,
              { fromAgentId: event.agentId, toAgentId: event.payload.toAgentId, createdAt: Date.now() }
            ]
            // Remove linha após 2.5s (controlado no canvas loop)
          }

          // Adiciona ao chat
          const instance = newState.instances.get(event.instanceId)
          newState.messages = [...newState.messages, {
            id: event.id,
            agentId: event.agentId,
            agentName: agent.name,
            instanceId: event.instanceId,
            instanceColor: instance?.color ?? '#888',
            content: event.payload.message ?? '',
            type: event.source === 'bridge' ? 'bridge' : 'message',
            timestamp: event.timestamp,
          }]
          break
        }

        case 'agent.task.completed':
          agent.visualState = 'CELEBRATING'
          agent.bubble = { type: 'speech', text: '✓', visible: true, createdAt: Date.now() }
          // Volta pra IDLE após 2s — controlado no canvas com animTick
          break

        case 'agent.idle':
          agent.visualState = 'IDLE'
          agent.bubble = { ...agent.bubble, visible: false }
          break
      }

      newState.agents = [
        ...newState.agents.slice(0, agentIdx),
        agent,
        ...newState.agents.slice(agentIdx + 1),
      ]
    }

    // Append ao log de eventos (máx 500)
    newState.events = [...newState.events.slice(-499), event]

    return newState
  }),

  setRoom: (roomId) => set({ activeRoomId: roomId, activeRoomConfig: ROOM_CONFIGS[roomId] }),
  addInstance: (instance) => set(s => ({ instances: new Map(s.instances).set(instance.id, instance) })),
  removeInstance: (instanceId) => set(s => {
    const next = new Map(s.instances)
    next.delete(instanceId)
    return {
      instances: next,
      agents: s.agents.filter(a => a.instanceId !== instanceId),
    }
  }),
  clearMessages: () => set({ messages: [] }),
}))
```

### 6.4 useSSE Hook

```typescript
// frontend/src/hooks/useSSE.ts
import { useEffect } from 'react'
import { useRoomStore } from '@/store/roomStore'

export function useSSE(instanceId = 'all') {
  const dispatch = useRoomStore(s => s.dispatch)
  const addInstance = useRoomStore(s => s.addInstance)
  const removeInstance = useRoomStore(s => s.removeInstance)

  useEffect(() => {
    const url = `/rooms/events?instanceId=${instanceId}`
    const es = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const event: CastEvent = JSON.parse(e.data)
        dispatch(event)
      } catch { /* ignora parse error */ }
    }

    // Eventos tipados específicos
    es.addEventListener('instance.created', (e) => {
      const event: CastEvent = JSON.parse((e as MessageEvent).data)
      addInstance({
        id: event.instanceId,
        name: event.payload.instanceName as string,
        model: event.payload.model as string,
        provider: event.payload.provider as string,
        roomId: event.roomId,
        color: event.payload.color as string,
        status: 'active',
        source: event.source,
        bridgeTool: event.payload.bridgeTool as string | undefined,
      })
    })

    es.addEventListener('instance.destroyed', (e) => {
      const event: CastEvent = JSON.parse((e as MessageEvent).data)
      removeInstance(event.instanceId)
    })

    // EventSource reconecta automaticamente quando cai.
    // O header `retry: 3000` define o intervalo.
    // Não precisa de lógica de retry manual.

    return () => es.close()
  }, [instanceId])
}
```

### 6.5 Canvas Isométrico — Especificação Técnica Completa

#### Sistema de Coordenadas

O canvas usa um sistema de grid isométrico 2:1. Cada tile tem:
- Largura visual: `TILE_W = 64px`
- Altura visual: `TILE_H = 32px`
- Grid: 10 × 8 tiles

Conversão cartesiana → tela:
```typescript
const TILE_W = 64
const TILE_H = 32
const ORIGIN_X = canvasWidth / 2   // centro horizontal
const ORIGIN_Y = 80                 // margem top

function isoToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + (gx - gy) * (TILE_W / 2),
    y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  }
}
```

#### Game Loop

```typescript
// frontend/src/components/canvas/IsometricCanvas.tsx
useEffect(() => {
  const canvas = canvasRef.current!
  const ctx = canvas.getContext('2d')!
  let animFrameId: number
  let globalTick = 0

  // Mantém canvas responsivo
  const resize = () => {
    canvas.width  = canvas.parentElement!.clientWidth
    canvas.height = canvas.parentElement!.clientHeight
  }
  window.addEventListener('resize', resize)
  resize()

  const loop = () => {
    globalTick++
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 1. Fundo da sala (gradiente radial suave)
    drawRoomBackground(ctx, canvas, roomConfig)

    // 2. Tiles do piso (painter's algorithm: back-to-front)
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        drawFloorTile(ctx, gx, gy, roomConfig, canvas)
      }
    }

    // 3. Objetos ambiente (móveis, decoração)
    for (const obj of roomConfig.visual.ambientObjects) {
      drawAmbientObject(ctx, obj, roomConfig, canvas)
    }

    // 4. Personagens (ordenados por posição Y para depth sorting correto)
    const sortedAgents = [...agents].sort((a, b) => (a.isoX + a.isoY) - (b.isoX + b.isoY))
    for (const agent of sortedAgents) {
      drawCharacter(ctx, agent, globalTick, roomConfig, canvas)
    }

    // 5. Linhas de conexão (sobre personagens, abaixo dos balões)
    const now = Date.now()
    for (const line of connectionLines) {
      if (now - line.createdAt < 2500) {
        drawConnectionLine(ctx, line, agents, canvas, now)
      }
    }

    // 6. Balões de fala (sempre no topo)
    for (const agent of sortedAgents) {
      if (agent.bubble.visible) {
        drawSpeechBubble(ctx, agent, roomConfig, canvas)
      }
    }

    animFrameId = requestAnimationFrame(loop)
  }

  animFrameId = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(animFrameId)
    window.removeEventListener('resize', resize)
  }
}, [agents, connectionLines, roomConfig])
```

#### Desenho do Piso por Padrão

```typescript
function drawFloorTile(ctx: CanvasRenderingContext2D, gx: number, gy: number, config: RoomConfig, canvas: HTMLCanvasElement) {
  const { x, y } = isoToScreen(gx, gy, canvas)
  const { floor, accent } = config.visual

  ctx.save()
  ctx.translate(x, y)

  // Losango isométrico (tile)
  ctx.beginPath()
  ctx.moveTo(0, 0)           // topo
  ctx.lineTo(TILE_W / 2, TILE_H / 2)   // direita
  ctx.lineTo(0, TILE_H)      // base
  ctx.lineTo(-TILE_W / 2, TILE_H / 2)  // esquerda
  ctx.closePath()

  // Fill baseado no padrão da sala
  switch (config.visual.tilePattern) {
    case 'wood':
      // Alternância de tons de madeira no checkerboard
      ctx.fillStyle = (gx + gy) % 2 === 0 ? floor : adjustBrightness(floor, 0.15)
      break
    case 'grass':
      ctx.fillStyle = (gx + gy) % 2 === 0 ? floor : adjustBrightness(floor, 0.1)
      break
    case 'metal':
      ctx.fillStyle = floor
      break
    case 'tiles':
      ctx.fillStyle = (gx + gy) % 2 === 0 ? floor : adjustBrightness(floor, 0.2)
      break
    case 'checkerboard':
      ctx.fillStyle = (gx + gy) % 2 === 0 ? floor : adjustBrightness(floor, 0.3)
      break
  }
  ctx.fill()

  // Borda do tile (muito sutil)
  ctx.strokeStyle = `rgba(255,255,255,0.04)`
  ctx.lineWidth = 0.5
  ctx.stroke()

  ctx.restore()
}
```

#### Sistema de Personagens — Pixel Art via Canvas API

Cada personagem é desenhado com primitivas Canvas (sem imagens). Estilo pixel art isométrico simplificado — o objetivo não é fotorrealismo, é expressividade e clareza.

```typescript
function drawCharacter(ctx: CanvasRenderingContext2D, agent: RoomAgent, tick: number, config: RoomConfig, canvas: HTMLCanvasElement) {
  const screen = isoToScreen(agent.isoX, agent.isoY, canvas)

  // Aplica bob vertical no estado IDLE
  let yOffset = 0
  if (agent.visualState === 'IDLE') {
    yOffset = Math.sin(tick * 0.04) * 2
  }
  if (agent.visualState === 'CELEBRATING') {
    // Salto — ciclo de 30 frames
    const phase = (tick % 60) / 60
    yOffset = -Math.sin(phase * Math.PI) * 16
  }

  const x = screen.x
  const y = screen.y + yOffset

  ctx.save()
  ctx.translate(x, y)

  // Sombra elíptica no chão (dá profundidade isométrica)
  drawCharacterShadow(ctx, yOffset)

  // Corpo do personagem baseado no estado
  switch (agent.visualState) {
    case 'IDLE':       drawCharacterIdle(ctx, agent, tick, config)       ; break
    case 'THINKING':   drawCharacterThinking(ctx, agent, tick, config)   ; break
    case 'WORKING':    drawCharacterWorking(ctx, agent, tick, config)    ; break
    case 'TOOL_USE':   drawCharacterToolUse(ctx, agent, tick, config)    ; break
    case 'TALKING':    drawCharacterTalking(ctx, agent, tick, config)    ; break
    case 'CELEBRATING':drawCharacterCelebrating(ctx, agent, tick, config); break
  }

  // Nome do agente abaixo do personagem
  drawAgentLabel(ctx, agent)

  ctx.restore()
}
```

**Anatomia do personagem (coordenadas relativas ao centro-base):**

```
Estrutura de um personagem (16×32px efetivos):

    y=-28  ●●●     ← cabeça: arc(0, -28, 7)
           ●●●
    y=-20  ███     ← pescoço: rect(-2, -22, 4, 4)
    y=-16  ████    ← ombros: rect(-8, -16, 16, 4)
    y=-12  ████    ← torso: rect(-6, -12, 12, 12)
    y=0    ██ ██   ← cintura: rect(-6, 0, 5, 2) + rect(1, 0, 5, 2)
    y=2    ██ ██   ← pernas: rect(-5, 2, 4, 8) + rect(1, 2, 4, 8)
    y=10   ██ ██   ← pés: rect(-5, 10, 4, 3) + rect(1, 10, 4, 3)

    Braços (quando IDLE):
    y=-14  ↓  ↓    ← rect(-10, -14, 3, 10) + rect(7, -14, 3, 10)
```

**Cores do personagem:**
- Cabeça: tom de pele neutro (`#e8c5a0`)
- Corpo: cor da instância com alpha 0.9 (`agent.instanceColor`)
- Braços: versão escura da cor da instância (brightness -20%)
- Pernas: versão mais escura ainda (brightness -40%)
- Olhos: dois pixels em `#1a1a1a`
- Destaque/especular: linha fina em `rgba(255,255,255,0.2)` no lado esquerdo (luz isométrica vem da esquerda-topo)

#### Animações por Estado e por Sala

**THINKING (universal):**
```typescript
function drawCharacterThinking(ctx, agent, tick, config) {
  // Postura levemente curvada — inclina torso 5°
  ctx.rotate(0.08)
  drawBaseCharacter(ctx, agent)
  ctx.rotate(-0.08)
}
// O balão de pensamento é desenhado separadamente em drawSpeechBubble
```

**WORKING — variante por sala:**

| Sala | Animação |
|------|---------|
| `bar` | Braço direito levanta e abaixa com "copo" (retângulo 4×8px). Ciclo 40 frames. `armR_y = -14 + sin(tick/40*2π) * 8` |
| `office` | Ambos os braços alternam posição horizontal (digitando). 4 posições em ciclo de 20 frames. |
| `gym` | Personagem deita (rotate 90°), braços sobem/descem com "barra" (linha horizontal). Ciclo 60 frames. |
| `park` | Pernas alternam em ciclo de corrida (8 posições). Ciclo 16 frames. Leve inclinação frontal. |
| `space` | Personagem flutua — bob ampliado (`sin * 8`) com rotação suave (`rotate(sin * 0.1)`). Ciclo 80 frames. |

```typescript
function drawCharacterWorking(ctx, agent, tick, config) {
  switch (config.id) {
    case 'bar': {
      const armRaise = Math.sin((tick % 40) / 40 * Math.PI * 2) * 8
      drawBaseCharacter(ctx, agent, { armROffset: { y: -14 + armRaise } })
      // Copo na mão
      ctx.fillStyle = '#d4a054'
      ctx.fillRect(8, -14 + armRaise, 5, 8)  // copo
      break
    }
    case 'office': {
      const frame = Math.floor(tick / 5) % 4
      const armPositions = [[-8, -4, 0, -6], [-6, -2, 2, -8], [-4, 0, 4, -4], [-6, -2, 2, -6]]
      const [lx, ly, rx, ry] = armPositions[frame]
      drawBaseCharacter(ctx, agent, { armLOffset: { x: lx, y: ly }, armROffset: { x: rx, y: ry } })
      break
    }
    case 'gym': {
      const liftPhase = Math.abs(Math.sin((tick % 60) / 60 * Math.PI))
      ctx.rotate(Math.PI / 2)  // deitar
      drawBaseCharacter(ctx, agent, { armLOffset: { y: -14 + liftPhase * 12 }, armROffset: { y: -14 + liftPhase * 12 } })
      ctx.rotate(-Math.PI / 2)
      break
    }
    case 'park': {
      const runFrame = Math.floor(tick / 2) % 8
      drawRunningCharacter(ctx, agent, runFrame)
      break
    }
    case 'space': {
      const float = Math.sin(tick * 0.025) * 8
      const tilt  = Math.sin(tick * 0.015) * 0.08
      ctx.translate(0, float)
      ctx.rotate(tilt)
      drawBaseCharacter(ctx, agent)
      ctx.rotate(-tilt)
      ctx.translate(0, -float)
      break
    }
  }
}
```

**TOOL_USE (universal):**
```typescript
function drawCharacterToolUse(ctx, agent, tick, config) {
  // Braço estendido apontando para frente-direita
  // Pisca rápido (visible a cada 3 frames)
  if (tick % 6 < 3) {
    drawBaseCharacter(ctx, agent, { armROffset: { x: 14, y: -18 } })
  } else {
    drawBaseCharacter(ctx, agent)
  }
}
```

**CELEBRATING (universal):**
```typescript
// O yOffset já foi calculado no drawCharacter principal (salto)
// Aqui só adiciona o gesto de braços levantados
function drawCharacterCelebrating(ctx, agent, tick, config) {
  drawBaseCharacter(ctx, agent, {
    armLOffset: { x: -12, y: -22 },  // braços para cima
    armROffset: { x: 12, y: -22 },
  })
  // Estrelinhas em volta (particleCount = 4, raio crescente)
  const phase = (tick % 60) / 60
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + phase * Math.PI * 2
    const r = phase * 20
    ctx.fillStyle = config.visual.accent
    ctx.globalAlpha = 1 - phase
    ctx.beginPath()
    ctx.arc(Math.cos(angle) * r, -20 + Math.sin(angle) * r * 0.5, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}
```

#### Balões de Fala — Especificação Completa

```typescript
function drawSpeechBubble(ctx: CanvasRenderingContext2D, agent: RoomAgent, config: RoomConfig, canvas: HTMLCanvasElement) {
  const screen = isoToScreen(agent.isoX, agent.isoY, canvas)
  const { bubble } = agent

  // Fade out automático após 3s
  const age = Date.now() - bubble.createdAt
  const BUBBLE_DURATION = 3000
  if (age > BUBBLE_DURATION) return
  const alpha = age > BUBBLE_DURATION * 0.7
    ? 1 - (age - BUBBLE_DURATION * 0.7) / (BUBBLE_DURATION * 0.3)
    : 1

  ctx.save()
  ctx.globalAlpha = alpha

  const bx = screen.x
  const by = screen.y - 60   // acima do personagem

  // Padding e dimensões
  const PAD_X = 10, PAD_Y = 7
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}12px "JetBrains Mono", monospace`
  const textW = Math.min(ctx.measureText(bubble.text).width, 160)
  const boxW = textW + PAD_X * 2
  const boxH = 26

  // Posição: se muito à direita, espelha para esquerda
  const finalX = bx + boxW / 2 > canvas.width - 10
    ? bx - boxW - 10
    : bx - boxW / 2

  switch (bubble.type) {
    case 'speech':
      drawRoundRect(ctx, finalX, by - boxH, boxW, boxH, 8)
      ctx.fillStyle = config.visual.accent
      ctx.globalAlpha = alpha * 0.15
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = config.visual.accent
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Triângulo (cauda) apontando para o personagem
      ctx.beginPath()
      ctx.moveTo(bx - 4, by)
      ctx.lineTo(bx + 4, by)
      ctx.lineTo(bx, by + 8)
      ctx.closePath()
      ctx.fillStyle = config.visual.accent
      ctx.globalAlpha = alpha * 0.15
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = config.visual.accent
      ctx.lineWidth = 1.5
      ctx.stroke()
      break

    case 'thought':
      // Oval com bolinhas de subida
      ctx.beginPath()
      ctx.ellipse(finalX + boxW/2, by - boxH/2, boxW/2 + 4, boxH/2 + 4, 0, 0, Math.PI*2)
      ctx.fillStyle = config.visual.accent
      ctx.globalAlpha = alpha * 0.1
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = config.visual.accent
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Bolinhas (3 tamanhos crescentes subindo até o balão)
      const dotPositions = [
        { x: bx, y: by + 6, r: 2 },
        { x: bx + 2, y: by + 2, r: 3 },
        { x: bx, y: by - 1, r: 4 },
      ]
      for (const d of dotPositions) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = config.visual.accent
        ctx.fill()
      }

      // Anima os "..." pulsando
      const dots = ['', '.', '..', '...']
      const dotFrame = Math.floor(Date.now() / 500) % 4
      ctx.fillStyle = config.visual.accent
      ctx.fillText(dots[dotFrame], finalX + PAD_X, by - boxH/2 + 4)
      ctx.restore()
      return  // retorna aqui — não desenha texto abaixo

    case 'tool':
      // Borda pontilhada
      ctx.setLineDash([3, 3])
      drawRoundRect(ctx, finalX, by - boxH, boxW + 20, boxH, 6)
      ctx.fillStyle = '#1a1a2e'
      ctx.globalAlpha = alpha * 0.8
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = config.visual.accent
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      // Ícone de tool (⚙)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = config.visual.accent
      ctx.fillText('⚙', finalX + 5, by - boxH/2 + 4)
      break
  }

  // Texto
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = alpha
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}12px "JetBrains Mono", monospace`
  ctx.fillText(
    bubble.text,
    bubble.type === 'tool' ? finalX + PAD_X + 16 : finalX + PAD_X,
    by - boxH/2 + 4
  )

  ctx.restore()
}
```

#### Linhas de Conexão (comunicação cross-agent)

```typescript
function drawConnectionLine(ctx, line, agents, canvas, now) {
  const from = agents.find(a => a.id === line.fromAgentId)
  const to   = agents.find(a => a.id === line.toAgentId)
  if (!from || !to) return

  const fromScreen = isoToScreen(from.isoX, from.isoY, canvas)
  const toScreen   = isoToScreen(to.isoX,   to.isoY,   canvas)

  const age    = now - line.createdAt
  const alpha  = age < 2000 ? 1 : 1 - (age - 2000) / 500
  const dashOff = (now / 30) % 12   // anima o traço

  ctx.save()
  ctx.globalAlpha = alpha * 0.7
  ctx.setLineDash([6, 6])
  ctx.lineDashOffset = -dashOff
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5

  ctx.beginPath()
  ctx.moveTo(fromScreen.x, fromScreen.y - 20)
  ctx.lineTo(toScreen.x,   toScreen.y   - 20)
  ctx.stroke()

  // Seta no destino
  drawArrowHead(ctx, fromScreen, toScreen)

  ctx.restore()
}
```

### 6.6 ChatPanel — Especificação Completa

```tsx
// frontend/src/components/ChatPanel.tsx

export function ChatPanel() {
  const messages = useRoomStore(s => s.messages)
  const listRef = useRef<HTMLDivElement>(null)
  const [userScrolled, setUserScrolled] = useState(false)

  // Detecta scroll manual do usuário
  const onScroll = () => {
    const el = listRef.current!
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setUserScrolled(!atBottom)
  }

  // Auto-scroll quando chegam novas mensagens (só se usuário não scrollou para cima)
  useEffect(() => {
    if (!userScrolled && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Mensagens</span>
        <span className="badge">{messages.length}</span>
      </div>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* Indicador de "novas mensagens" quando usuário scrollou para cima */}
      {userScrolled && <NewMessagesIndicator onClick={() => {
        listRef.current!.scrollTop = listRef.current!.scrollHeight
        setUserScrolled(false)
      }} />}
    </div>
  )
}
```

**CSS do ChatPanel:**

```css
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--border);
  background: var(--surface);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  scroll-behavior: smooth;
}

/* Scrollbar customizada */
.chat-list::-webkit-scrollbar { width: 4px; }
.chat-list::-webkit-scrollbar-track { background: transparent; }
.chat-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.chat-message {
  padding: 6px 16px;
  border-left: 2px solid transparent;
  transition: background var(--duration-fast);
}
.chat-message:hover { background: var(--card); }
.chat-message.type-bridge { border-left-color: var(--purple); }
.chat-message.type-tool_call { border-left-color: var(--yellow); }

.chat-message-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.agent-name {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  /* color é definido inline pelo instanceColor */
}

.message-time {
  font-size: var(--text-xs);
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.message-content {
  font-size: var(--text-sm);
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
}
```

### 6.7 KanbanMini

```tsx
// frontend/src/components/KanbanMini.tsx

export function KanbanMini() {
  const events      = useRoomStore(s => s.events)
  const roomConfig  = useRoomStore(s => s.activeRoomConfig)

  // Deriva estado do kanban a partir dos eventos
  const kanbanTasks = useMemo(() => {
    const tasks: Map<string, { id: string; subject: string; status: string; agentId: string }> = new Map()

    for (const event of events) {
      if (event.type === 'agent.task.started') {
        tasks.set(event.payload.taskId!, {
          id: event.payload.taskId!,
          subject: event.payload.taskSubject ?? '...',
          status: 'doing',
          agentId: event.agentId,
        })
      }
      if (event.type === 'agent.task.completed') {
        const t = tasks.get(event.payload.taskId!)
        if (t) tasks.set(t.id, { ...t, status: 'done' })
      }
      if (event.type === 'agent.task.failed') {
        const t = tasks.get(event.payload.taskId!)
        if (t) tasks.set(t.id, { ...t, status: 'failed' })
      }
    }

    return Array.from(tasks.values())
  }, [events])

  const columns = [
    { key: 'doing', label: roomConfig?.kanban.doing  ?? 'In Progress' },
    { key: 'done',  label: roomConfig?.kanban.done   ?? 'Done'        },
    { key: 'failed',label: roomConfig?.kanban.failed ?? 'Failed'      },
  ]

  return (
    <div className="kanban-mini">
      <div className="kanban-mini-header">
        {roomConfig?.name ?? 'Kanban'}
      </div>
      <div className="kanban-mini-columns">
        {columns.map(col => (
          <div key={col.key} className="kanban-mini-col">
            <div className="kanban-col-label">{col.label}</div>
            <div className="kanban-col-tasks">
              {kanbanTasks
                .filter(t => t.status === col.key)
                .slice(-3)   // mostra só as últimas 3 por coluna
                .map(task => (
                  <div key={task.id} className={`kanban-task kanban-task--${col.key}`}>
                    {task.subject.slice(0, 30)}
                  </div>
                ))
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 6.8 Header da Sala

```tsx
// frontend/src/components/RoomHeader.tsx

export function RoomHeader() {
  const roomConfig  = useRoomStore(s => s.activeRoomConfig)
  const instances   = useRoomStore(s => s.instances)
  const [showModal, setShowModal] = useState(false)

  return (
    <header className="room-header">
      {/* Nome da sala */}
      <div className="room-title">
        <span className="room-emoji">{roomConfig?.visual.emoji}</span>
        <span className="room-name">{roomConfig?.name}</span>
      </div>

      {/* Seletor de salas */}
      <RoomSelector />

      {/* Instâncias ativas */}
      <div className="instances-bar">
        {Array.from(instances.values()).map(inst => (
          <InstanceBadge key={inst.id} instance={inst} />
        ))}
      </div>

      {/* Botão nova instância */}
      <button className="btn-add-instance" onClick={() => setShowModal(true)}>
        + Nova
      </button>

      {showModal && <NewInstanceModal onClose={() => setShowModal(false)} />}
    </header>
  )
}
```

**CSS do Header:**

```css
.room-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  height: var(--header-height);
  background: var(--surface);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  grid-column: 1 / -1;
}

.room-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.room-emoji { font-size: 20px; }
.room-name  { font-size: var(--text-md); font-weight: var(--font-semibold); }

.instances-bar {
  display: flex;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.instance-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--card);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.instance-badge-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  /* background: instanceColor */
}
.instance-badge-dot.active { animation: pulse 2s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.btn-add-instance {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--duration-fast);
  flex-shrink: 0;
}
.btn-add-instance:hover {
  border-color: var(--border-hover);
  color: var(--text);
  background: var(--card);
}
```

---

## 7. Fase 3 — Multi-Instâncias

**Semanas 7–9.**

### 7.1 RoomInstanceService (Backend)

```typescript
// src/modules/rooms/services/room-instance.service.ts
@Injectable()
export class RoomInstanceService {
  private instances: Map<string, RoomInstance> = new Map()

  constructor(
    private readonly eventBus: RoomEventBusService,
    private readonly multiLlm: MultiLlmService,
  ) {}

  async create(req: CreateInstanceRequest): Promise<RoomInstance> {
    const config = ROOM_CONFIGS[req.roomId]
    const instance: RoomInstance = {
      id: crypto.randomUUID(),
      name: req.name,
      model: req.model,
      provider: req.provider,
      roomId: req.roomId,
      color: req.color,
      status: 'active',
      source: 'native',
      roomConfig: config,
      createdAt: Date.now(),
    }

    this.instances.set(instance.id, instance)

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'instance.created',
      agentId: req.name.toLowerCase().replace(/\s/g, '-'),
      instanceId: instance.id,
      roomId: req.roomId,
      source: 'native',
      payload: {
        instanceName: req.name,
        model: req.model,
        provider: req.provider,
        color: req.color,
      },
      timestamp: Date.now(),
    })

    return instance
  }

  destroy(instanceId: string): void {
    const instance = this.instances.get(instanceId)
    if (!instance) return

    this.instances.delete(instanceId)
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'instance.destroyed',
      agentId: '',
      instanceId,
      roomId: instance.roomId,
      source: 'native',
      payload: {},
      timestamp: Date.now(),
    })
  }

  list(): RoomInstance[] {
    return Array.from(this.instances.values())
  }

  get(id: string): RoomInstance | undefined {
    return this.instances.get(id)
  }
}
```

### 7.2 RoomChannelService (pub/sub entre instâncias)

```typescript
// src/modules/rooms/services/room-channel.service.ts
@Injectable()
export class RoomChannelService {
  // Map de roomId → lista de callbacks de instâncias subscritas
  private subscribers: Map<string, ((msg: RoomMessage) => void)[]> = new Map()

  subscribe(roomId: string, instanceId: string, callback: (msg: RoomMessage) => void): () => void {
    if (!this.subscribers.has(roomId)) this.subscribers.set(roomId, [])
    this.subscribers.get(roomId)!.push(callback)

    // Retorna função de unsubscribe
    return () => {
      const subs = this.subscribers.get(roomId) ?? []
      this.subscribers.set(roomId, subs.filter(cb => cb !== callback))
    }
  }

  publish(msg: RoomMessage): void {
    const subs = this.subscribers.get(msg.roomId) ?? []
    for (const sub of subs) {
      try { sub(msg) } catch { }
    }
  }
}

interface RoomMessage {
  from: string          // instanceId do remetente
  to: string | 'all'   // instanceId do destino ou broadcast
  roomId: string
  content: string       // mensagem em plaintext
  type: 'task' | 'result' | 'question' | 'broadcast'
  traceId: string
}
```

### 7.3 Tool send_to_agent

Cada instância com Room configurado recebe esta tool adicional:

```typescript
{
  name: 'send_to_agent',
  description: 'Envia uma mensagem para outro agente presente na sala',
  schema: z.object({
    agentId: z.string().describe('ID do agente destino (ex: garcom, cozinheiro)'),
    message: z.string().describe('A mensagem a ser enviada'),
    type: z.enum(['task', 'question', 'result']).default('task'),
  }),
  execute: async ({ agentId, message, type }) => {
    roomChannel.publish({
      from: this.instanceId,
      to: agentId,
      roomId: this.roomId,
      content: message,
      type,
      traceId: crypto.randomUUID(),
    })
    return `Mensagem enviada para ${agentId}`
  }
}
```

### 7.4 Posicionamento Automático no Canvas

Quando múltiplas instâncias existem na mesma sala:

```typescript
function assignAgentPositions(agents: RoomAgent[]): RoomAgent[] {
  // Distribui em semicírculo de raio 3 tiles, centrado em (5, 4)
  return agents.map((agent, i) => {
    const total = agents.length
    const angle = (i / total) * Math.PI + Math.PI / total
    const r = Math.max(2, Math.min(4, total))
    return {
      ...agent,
      isoX: Math.round(5 + Math.cos(angle) * r),
      isoY: Math.round(4 + Math.sin(angle) * r * 0.7),
    }
  })
}
```

### 7.5 NewInstanceModal — Especificação Visual

```tsx
// Campos do modal
// ┌─────────────────────────────────┐
// │ ✕          Nova Instância       │
// ├─────────────────────────────────┤
// │ Nome                            │
// │ [Bartender Principal__________] │
// │                                 │
// │ Provider          Modelo        │
// │ [Anthropic    ▼]  [claude-s ▼]  │
// │                                 │
// │ Sala                            │
// │ [🍺 Bar do Código          ▼]   │
// │                                 │
// │ Cor identificadora              │
// │ ● ● ● ● ● ●  (6 opções)        │
// │                                 │
// │ API Key (opcional)              │
// │ [sk-ant-______________________] │
// │                                 │
// └──────────[Cancelar] [Criar →]───┘

// Dimensões: width 420px, border-radius 16px
// backdrop: rgba(0,0,0,0.6) blur(4px)
// animação: scale de 0.95→1 + opacity 0→1 em 200ms
```

---

## 8. Fase 3.5 — Cross-Terminal Bridge

Esta é a feature mais diferenciadora. Você roda o cast-code em um terminal, Claude Code em outro, Codex em outro — e todos aparecem como agentes na mesma sala, podendo se comunicar.

### 8.1 Arquitetura

```
Terminal 1: cast rooms --serve
             └── Room Server (porta 3335)
                 ├── SSE: /rooms/events
                 ├── REST: /rooms/instances
                 ├── Bridge: /rooms/bridge/:instanceId/connect  (SSE de entrada)
                 └── Bridge: /rooms/bridge/:instanceId/message  (POST de saída)

Terminal 2: cast bridge --name "Claude" --room bar -- claude
             └── BridgeProcess
                 ├── Spawn: `claude` com stdin/stdout/stderr piped
                 ├── stdout → POST /rooms/bridge/:id/events     (o que Claude está fazendo)
                 └── GET  /rooms/bridge/:id/inbox               (mensagens para Claude)
                          └── injeta no stdin de `claude`

Terminal 3: cast bridge --name "Codex" --room bar -- codex
Terminal 4: cast bridge --name "Qwen"  --room bar -- qwen

Browser:    localhost:5173/rooms
             └── Vê todos os 4 agentes animados na mesma sala
```

### 8.2 Protocolo do Room Bridge

#### Registro no Room Server

Ao iniciar, o bridge faz:

```http
POST /rooms/bridge/register
Content-Type: application/json

{
  "name": "Claude",
  "tool": "claude",
  "roomId": "bar",
  "color": "#a78bfa",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic"
}

→ 200 { "instanceId": "bridge-abc123", "token": "tok_xyz..." }
```

#### Envio de Eventos (bridge → Room Server)

O bridge parseia o stdout da ferramenta e envia eventos:

```http
POST /rooms/bridge/bridge-abc123/event
Authorization: Bearer tok_xyz...
Content-Type: application/json

{
  "type": "agent.message.sent",
  "agentId": "claude",
  "payload": { "message": "Implementando o middleware de auth..." }
}
```

#### Recebimento de Mensagens (Room Server → bridge → stdin da tool)

O bridge se inscreve via SSE:

```http
GET /rooms/bridge/bridge-abc123/inbox
Authorization: Bearer tok_xyz...
```

Quando o Room Server publica mensagem para essa instância, o bridge recebe o evento SSE e escreve no stdin do processo filho:

```typescript
es.addEventListener('room.message', (e) => {
  const msg = JSON.parse(e.data)
  childProcess.stdin.write(msg.content + '\n')
})
```

### 8.3 BridgeCLI — Implementação

```typescript
// src/modules/rooms/services/bridge-cli.service.ts
// Ativado via: cast bridge --name "Claude" --room bar -- claude

import { spawn, ChildProcess } from 'child_process'
import * as readline from 'readline'

export class BridgeCli {
  private child: ChildProcess | null = null
  private instanceId: string | null = null
  private token: string | null = null
  private inbox: EventSource | null = null

  async start(opts: BridgeOptions, toolArgs: string[]) {
    // 1. Registra no Room Server
    const reg = await this.register(opts)
    this.instanceId = reg.instanceId
    this.token = reg.token

    // 2. Spawn da ferramenta
    this.child = spawn(toolArgs[0], toolArgs.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    // 3. Parseia stdout → emite eventos
    this.setupStdoutParser()

    // 4. Passa stderr direto para o terminal do usuário (não queremos esconder erros)
    this.child.stderr?.pipe(process.stderr)

    // 5. Inscreve no inbox para receber mensagens de outros agentes
    this.subscribeInbox()

    // 6. Passa input do terminal para a ferramenta (o usuário ainda pode digitar)
    process.stdin.pipe(this.child.stdin!)

    // 7. Quando a ferramenta termina, deregistra
    this.child.on('exit', () => this.cleanup())

    console.log(`[Room Bridge] ${opts.name} conectado como agente na sala "${opts.roomId}"`)
    console.log(`[Room Bridge] Ver em: http://localhost:5173/rooms`)
  }

  private setupStdoutParser() {
    const rl = readline.createInterface({ input: this.child!.stdout! })

    rl.on('line', (line) => {
      // Passa output para o terminal do usuário
      process.stdout.write(line + '\n')

      // Tenta fazer parse de eventos conhecidos
      const event = this.parseLine(line)
      if (event) {
        this.postEvent(event)
      }
    })
  }

  private parseLine(line: string): Partial<CastEvent> | null {
    // Heurísticas para detectar o que a ferramenta está fazendo

    // Claude Code streaming format
    if (line.includes('"type":"content_block_start"')) {
      return { type: 'agent.thinking' }
    }
    if (line.includes('"type":"tool_use"')) {
      try {
        const m = line.match(/"name":"([^"]+)"/)
        return { type: 'agent.tool.called', payload: { toolName: m?.[1] ?? 'tool' } }
      } catch { }
    }

    // Heurísticas genéricas para qualquer ferramenta
    if (/executing|running|calling/i.test(line)) {
      return { type: 'agent.thinking' }
    }
    if (/completed|done|finished/i.test(line)) {
      return { type: 'agent.task.completed' }
    }
    if (/error|failed|exception/i.test(line)) {
      return { type: 'agent.task.failed', payload: { error: line.slice(0, 100) } }
    }

    // Linhas longas = provavelmente output de raciocínio → message.sent
    if (line.length > 50 && !line.startsWith('[') && !line.startsWith('{')) {
      return { type: 'agent.message.sent', payload: { message: line.slice(0, 200) } }
    }

    return null
  }

  private subscribeInbox() {
    const url = `http://localhost:3335/rooms/bridge/${this.instanceId}/inbox`
    // Usando EventSource nativo do Node 22+
    // Para Node mais antigo, usar eventsource package
    this.inbox = new EventSource(url, {
      headers: { Authorization: `Bearer ${this.token}` }
    } as any)

    this.inbox.addEventListener('room.message', (e) => {
      const msg = JSON.parse((e as MessageEvent).data)
      // Injeta mensagem no stdin da ferramenta
      if (this.child?.stdin && !this.child.stdin.destroyed) {
        this.child.stdin.write(msg.content + '\n')
        console.log(`\n[Room] Mensagem de ${msg.fromAgentName}: ${msg.content}`)
      }
    })
  }
}
```

### 8.4 Adaptadores por Ferramenta

Além das heurísticas genéricas, o bridge tem adaptadores específicos:

```typescript
// src/modules/rooms/bridge/adapters/

// claude.adapter.ts — parseia o formato de streaming do Claude Code
export class ClaudeAdapter implements BridgeAdapter {
  parseLine(line: string): Partial<CastEvent> | null {
    try {
      const json = JSON.parse(line)
      if (json.type === 'assistant' && json.message?.content) {
        const content = json.message.content
        const textBlock = content.find((b: any) => b.type === 'text')
        const toolBlock = content.find((b: any) => b.type === 'tool_use')

        if (toolBlock) return {
          type: 'agent.tool.called',
          payload: { toolName: toolBlock.name, toolArgs: toolBlock.input }
        }
        if (textBlock) return {
          type: 'agent.message.sent',
          payload: { message: textBlock.text.slice(0, 200) }
        }
      }
      if (json.type === 'result') return { type: 'agent.task.completed' }
    } catch { }
    return null
  }
}

// codex.adapter.ts
export class CodexAdapter implements BridgeAdapter {
  parseLine(line: string): Partial<CastEvent> | null {
    if (line.startsWith('> ')) return { type: 'agent.thinking' }
    if (line.includes('Running:')) return { type: 'agent.tool.called', payload: { toolName: 'shell' } }
    if (line.includes('Done.')) return { type: 'agent.task.completed' }
    return null
  }
}

// generic.adapter.ts — fallback para qualquer ferramenta
export class GenericAdapter implements BridgeAdapter {
  // ... heurísticas descritas acima
}

// Registro de adapters
export const ADAPTERS: Record<string, BridgeAdapter> = {
  claude: new ClaudeAdapter(),
  codex:  new CodexAdapter(),
  qwen:   new GenericAdapter(),
  gemini: new GenericAdapter(),
}
```

### 8.5 Visualização no Frontend — Agentes Bridge

Agentes vindos de bridge têm badge especial no canvas e no chat:

```typescript
// No drawAgentLabel:
if (agent.source === 'bridge') {
  // Badge "bridge" em roxo abaixo do nome
  ctx.fillStyle = '#a78bfa'
  ctx.font = '9px sans-serif'
  ctx.fillText(`[${agent.bridgeTool ?? 'bridge'}]`, x - 12, y + 16)
}
```

No ChatPanel, mensagens de bridge têm borda lateral roxa:
```css
.chat-message.type-bridge {
  border-left: 2px solid var(--purple);
  background: rgba(167, 139, 250, 0.05);
}
```

### 8.6 Comando CLI

```typescript
// src/modules/repl/services/commands/rooms-commands.service.ts

// cast rooms
//   → abre o browser com a UI

// cast rooms --serve
//   → inicia o Room Server sem abrir browser

// cast bridge --name "Claude" --room bar --color "#a78bfa" -- claude
//   → inicia bridge wrapping o `claude` CLI

// cast bridge --name "Codex" --room office -- codex --approval-mode suggest
//   → passa flags para a ferramenta wrapped
```

### 8.7 Como usar na prática

```bash
# Terminal 1 — cast como orquestrador principal
cast
# Abre o REPL normalmente. Internamente, também registra como agente "cast" na sala.

# Terminal 2 — Claude Code como co-agente
cast bridge --name "Claude" --room bar -- claude

# Terminal 3 — Codex como co-agente
cast bridge --name "Codex" --room bar -- codex

# Browser — abre a sala
open http://localhost:5173/rooms
# Vê os 3 personagens animados, cada um reagindo ao que seu CLI está fazendo

# No cast REPL, você pode delegar para outros agentes:
> Delega a task de implementar auth JWT para o Claude
# cast usa send_to_agent("claude", "Implementar middleware de auth JWT")
# O Claude Code no terminal 2 recebe a mensagem no stdin e começa a trabalhar
# A mensagem aparece como linha animada no canvas conectando cast → Claude
```

---

## 9. Fase 4 — Long Term Memory

**Semanas 10–12.**

### 9.1 Estrutura de Arquivos

```
.cast-code/              ← raiz no cwd do projeto
└── ltm/
    ├── bartender-abc123/
    │   ├── session-2026-03-24.md
    │   ├── session-2026-03-25.md
    │   └── compressed-memory.md
    └── claude-bridge-xyz/
        └── session-2026-03-24.md
```

O `instanceId` usado como nome de pasta é o id da instância, garantindo que modelos diferentes em salas diferentes não misturam memória.

### 9.2 Formato dos Arquivos de Sessão

```markdown
# Sessão 2026-03-24 — Bartender (claude-sonnet-4-6) — Bar do Código

## Decisões Arquiteturais
- Optou-se por usar JWT com refresh tokens em vez de sessions por ser stateless
- Redis escolhido para cache de sessão por já estar na infra

## Problemas e Soluções
- **Problema:** CORS bloqueando requests do frontend para /api/auth
  - **Solução:** Adicionar header `credentials: true` e origin específica no NestJS CORS config

## Estado do Projeto
- Autenticação: ✓ Implementada e testada
- Autorização (RBAC): 🔄 Em andamento — middleware criado, falta integrar nos controllers
- Testes de integração: ✗ Não iniciado

## Preferências do Usuário
- Prefere commits pequenos e frequentes
- Usa conventional commits rigorosamente
- Não gosta de over-engineering — soluções simples primeiro
```

### 9.3 RoomLtmService

```typescript
// src/modules/rooms/services/room-ltm.service.ts

@Injectable()
export class RoomLtmService {
  private readonly BASE_DIR = path.join(process.cwd(), '.cast-code', 'ltm')
  private readonly MAX_SESSIONS_BEFORE_COMPRESS = 5
  private readonly AUTO_COMPRESS_ROUNDS = 10
  private roundCounters: Map<string, number> = new Map()

  constructor(private readonly multiLlm: MultiLlmService) {}

  async loadMemory(instanceId: string): Promise<string> {
    const dir = path.join(this.BASE_DIR, instanceId)
    if (!fs.existsSync(dir)) return ''

    const parts: string[] = []

    // Memória comprimida (histórico longo)
    const compressedPath = path.join(dir, 'compressed-memory.md')
    if (fs.existsSync(compressedPath)) {
      parts.push(`## Memória Histórica (comprimida)\n${fs.readFileSync(compressedPath, 'utf8')}`)
    }

    // Sessão mais recente
    const sessions = this.listSessions(instanceId)
    if (sessions.length > 0) {
      const latest = sessions[sessions.length - 1]
      const content = fs.readFileSync(path.join(dir, latest), 'utf8')
      parts.push(`## Sessão Anterior (${latest.replace('session-', '').replace('.md', '')})\n${content}`)
    }

    if (parts.length === 0) return ''

    return `--- LONG TERM MEMORY ---\n${parts.join('\n\n')}\n------------------------`
  }

  async saveSession(instanceId: string, history: BaseMessage[], metadata: SessionMetadata): Promise<void> {
    const dir = path.join(this.BASE_DIR, instanceId)
    fs.mkdirSync(dir, { recursive: true })

    const today = new Date().toISOString().split('T')[0]
    const filename = `session-${today}.md`

    const summary = await this.summarizeHistory(history, metadata)
    fs.writeFileSync(path.join(dir, filename), summary)

    // Se acumulou muitas sessões, comprime
    const sessions = this.listSessions(instanceId)
    if (sessions.length >= this.MAX_SESSIONS_BEFORE_COMPRESS) {
      await this.compressHistory(instanceId)
    }
  }

  async autoCompress(instanceId: string, history: BaseMessage[]): Promise<BaseMessage[]> {
    const count = (this.roundCounters.get(instanceId) ?? 0) + 1
    this.roundCounters.set(instanceId, count)

    if (count % this.AUTO_COMPRESS_ROUNDS !== 0) return history

    // Comprime as últimas N mensagens
    const toCompress = history.slice(0, -5)   // mantém as 5 mais recentes intactas
    const keep       = history.slice(-5)

    if (toCompress.length === 0) return history

    const model  = this.multiLlm.createModel('default')
    const prompt = `Resuma as seguintes mensagens em 1-2 parágrafos, preservando o contexto técnico essencial:\n\n${toCompress.map(m => `${m._getType()}: ${(m as any).content}`).join('\n')}`
    const result = await model.invoke([new HumanMessage(prompt)])
    const summary = new SystemMessage(`[Contexto comprimido automaticamente]\n${result.content}`)

    return [summary, ...keep]
  }

  private async summarizeHistory(history: BaseMessage[], meta: SessionMetadata): Promise<string> {
    const model  = this.multiLlm.createModel('default')
    const historyText = history
      .slice(-60)   // últimas 60 mensagens
      .map(m => `**${m._getType()}:** ${(m as any).content?.toString().slice(0, 500)}`)
      .join('\n\n')

    const prompt = `Você é um assistente de memória. Analise esta sessão de trabalho e crie um resumo estruturado.

# Metadados
- Agente: ${meta.agentName} (${meta.model})
- Sala: ${meta.roomName}
- Duração: ${Math.round(meta.durationMs / 60000)}min
- Tasks concluídas: ${meta.tasksCompleted}

# Histórico de Conversa
${historyText}

---
Crie um resumo em markdown com as seções:
1. ## Decisões Arquiteturais
2. ## Problemas e Soluções
3. ## Estado do Projeto
4. ## Preferências do Usuário

Máximo 400 palavras. Seja específico e técnico.`

    const result = await model.invoke([new HumanMessage(prompt)])
    const header = `# Sessão ${new Date().toISOString().split('T')[0]} — ${meta.agentName} (${meta.model}) — ${meta.roomName}\n\n`

    return header + result.content
  }

  private async compressHistory(instanceId: string): Promise<void> {
    const dir      = path.join(this.BASE_DIR, instanceId)
    const sessions = this.listSessions(instanceId)
    const allContent = sessions.map(s => fs.readFileSync(path.join(dir, s), 'utf8')).join('\n\n---\n\n')

    const model  = this.multiLlm.createModel('default')
    const prompt = `Comprima o seguinte histórico de sessões em uma memória consolidada de no máximo 600 palavras, preservando decisões importantes, padrões do usuário e contexto técnico:\n\n${allContent}`
    const result = await model.invoke([new HumanMessage(prompt)])

    fs.writeFileSync(path.join(dir, 'compressed-memory.md'), result.content as string)

    // Mantém só as 2 sessões mais recentes
    const toDelete = sessions.slice(0, -2)
    for (const f of toDelete) {
      fs.unlinkSync(path.join(dir, f))
    }
  }

  private listSessions(instanceId: string): string[] {
    const dir = path.join(this.BASE_DIR, instanceId)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('session-') && f.endsWith('.md'))
      .sort()
  }
}
```

---

## 10. Estrutura Completa de Arquivos

```
cast-code/
├── src/
│   ├── app.module.ts                          ← adicionar RoomsModule aqui
│   └── modules/
│       ├── rooms/                             ← NOVO MÓDULO COMPLETO
│       │   ├── rooms.module.ts
│       │   ├── configs/
│       │   │   ├── index.ts                   ← exporta ROOM_CONFIGS map
│       │   │   ├── bar.config.ts
│       │   │   ├── office.config.ts
│       │   │   ├── gym.config.ts
│       │   │   ├── park.config.ts
│       │   │   └── space.config.ts
│       │   ├── services/
│       │   │   ├── room-event-bus.service.ts
│       │   │   ├── room-sse.service.ts
│       │   │   ├── room-instance.service.ts
│       │   │   ├── room-channel.service.ts
│       │   │   └── room-ltm.service.ts
│       │   ├── bridge/
│       │   │   ├── bridge-cli.service.ts      ← `cast bridge` command
│       │   │   └── adapters/
│       │   │       ├── claude.adapter.ts
│       │   │       ├── codex.adapter.ts
│       │   │       └── generic.adapter.ts
│       │   └── types/
│       │       ├── room.types.ts
│       │       └── event.types.ts
│       ├── core/
│       │   └── services/
│       │       └── deep-agent.service.ts      ← adicionar emit() nos pontos certos
│       └── repl/
│           └── services/
│               └── commands/
│                   └── rooms-commands.service.ts  ← comandos `cast rooms` e `cast bridge`
│
└── frontend/                                  ← NOVO — React App (Vite)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── routes/
        │   └── rooms/
        │       └── RoomsPage.tsx
        ├── components/
        │   ├── canvas/
        │   │   ├── IsometricCanvas.tsx
        │   │   ├── draw-floor.ts
        │   │   ├── draw-character.ts
        │   │   ├── draw-bubble.ts
        │   │   ├── draw-ambient.ts
        │   │   └── draw-connection.ts
        │   ├── RoomHeader.tsx
        │   ├── ChatPanel.tsx
        │   ├── KanbanMini.tsx
        │   ├── InstancePanel.tsx
        │   ├── NewInstanceModal.tsx
        │   └── RoomSelector.tsx
        ├── hooks/
        │   └── useSSE.ts
        ├── store/
        │   └── roomStore.ts
        ├── configs/                           ← cópia das configs de sala (subset para o frontend)
        │   ├── index.ts
        │   ├── bar.config.ts
        │   └── ...
        └── styles/
            ├── globals.css                    ← variáveis CSS, reset
            ├── layout.css
            └── components.css
```

---

## 11. Dependências

### Backend (adicionar ao `package.json` raiz)

```json
{
  "dependencies": {
    "eventemitter2": "^6.4.9"
  }
}
```

### Frontend (`frontend/package.json`)

```json
{
  "name": "cast-code-rooms",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.3.0",
    "vite": "^6.0.0"
  }
}
```

**Nota:** Zero dependências de canvas/game engine. Canvas API pura. Zero dependências de UI library (sem shadcn, sem MUI). CSS puro com custom properties.

---

## 12. Decisões Técnicas e Trade-offs

| Decisão | Alternativa | Motivo |
|---------|-------------|--------|
| Canvas API pura | Phaser, PixiJS, Konva | Zero overhead, total controle, bundle mínimo. A cena é simples o suficiente. |
| SSE (não WebSocket) | WebSocket | SSE é unidirecional server→client, mais simples, reconexão automática nativa pelo browser. Suficiente para o caso de uso. |
| EventEmitter2 (não RxJS) | RxJS Subjects | Wildcard nativo sem overhead de observables. Já usa padrão de Node puro. |
| Arquivos `.md` para LTM | SQLite, Postgres, Redis | Portável, sem setup, versionável com git, legível por humanos. |
| Servidor HTTP raw porta 3335 | NestJS @Sse decorator | Consistência com o padrão já estabelecido no projeto (kanban:3333, remote:3334). |
| Zustand (não Redux) | Redux Toolkit, Context | API mínima, zero boilerplate, perfeito para estado reativo de UI em tempo real. |
| Vite (não CRA, não Next.js) | Create React App | Build sub-segundo, HMR instantâneo, sem overhead de framework. |
| stdin injection para bridge | Claude Code hooks, IPC | Universal — funciona com qualquer ferramenta CLI, sem depender de APIs proprietárias. |
| Processo filho piped (bridge) | Shared memory, arquivos | Transparente para a ferramenta wrapped, sem modificação necessária. |
| Pixel art com primitivas Canvas | Sprites PNG, SVG | Sem assets externos, sem problemas de licença, escala perfeitamente, tamanho zero. |

---

## Apêndice — Sequência de Deploy em Produção

```bash
# Build do frontend
cd frontend && npm run build
# → gera dist/ que vai para src/modules/rooms/static/

# Build do backend (NestJS já serve os arquivos estáticos)
npm run build

# O servidor de rooms sobe automaticamente ao iniciar o cast
# A UI fica disponível em localhost:5173 (dev) ou localhost:3335/rooms (prod)
```

O NestJS serve os arquivos estáticos em produção adicionando no `RoomSseService`:

```typescript
// Serve o index.html para qualquer rota que não seja /rooms/events ou /rooms/bridge
if (url.pathname.startsWith('/rooms') && !url.pathname.startsWith('/rooms/events') && !url.pathname.startsWith('/rooms/bridge')) {
  const staticPath = path.join(__dirname, 'static', url.pathname.replace('/rooms', '') || 'index.html')
  const file = fs.existsSync(staticPath) ? staticPath : path.join(__dirname, 'static', 'index.html')
  res.writeHead(200, { 'Content-Type': getMimeType(file) })
  fs.createReadStream(file).pipe(res)
}
```
