# Plano de Ação — Refatoração Cast Code v2

> Inspirado na arquitetura do **Redux Toolkit (RTK/RTK Query)**, aplicado ao contexto de um CLI AI agent com NestJS.

---

## O que é RTK e o que podemos aproveitar

O **Redux Toolkit** resolveu 3 problemas fundamentais do Redux clássico:

| Problema no Redux | Solução RTK | Análogo no Cast Code |
|---|---|---|
| Boilerplate excessivo (actions, reducers, thunks) | `createSlice` + `createAsyncThunk` | 8 `forwardRef` cycles entre módulos |
| Data fetching manual com cache inconsistente | `createApi` com **tag-based invalidation** | Skills/tools descobertos manualmente via 2+ tool calls |
| Estado desnormalizado e duplicado | Entity Adapter + normalização automática | State espalhado em Maps, JSON files, SQLite sem padrão |
| Sem lifecycle de subscribers | Cache entries com GC quando subscribers = 0 | Rooms/Instances sem cleanup automático de estado |

### Conceitos RTK aplicáveis ao Cast Code

**1. `createSlice` → Capability Slices**
Cada módulo expõe seu estado via um "slice" padronizado, eliminando a necessidade de import mútuo entre módulos.

**2. `createApi` → Declarative Agent Capabilities**
Ao invés de cada módulo importar outro e resolver ferramentas manualmente, definimos capacidades declarativamente com resolução automática de dependências.

**3. Tag-based Invalidation → Event-driven Cache Sync**
Quando uma ferramenta modifica estado (ex: `write_file`, `task_update`), os caches relacionados são invalidados automaticamente via tags, não via calls manuais entre módulos.

**4. Subscription Lifecycle → Auto-GC de Rooms/Instances**
Quando nenhum subscriber está ouvindo os eventos de uma room/instance, o estado é compactado ou removido automaticamente.

---

## Plano de Implementação

### Fase 1: Quebrar Dependências Circulares (forwardRef)
**Problema**: 8 ciclos entre `CoreModule ↔ ToolsModule ↔ SkillsModule ↔ AgentsModule ↔ MemoryModule ↔ TasksModule`

**Solução RTK-inspired**: Criar um módulo central de capacidades que elimina a necessidade de import mútuo.

#### 1.1. Criar `AgentCapabilitiesModule`

```
src/modules/capabilities/
├── capabilities.module.ts          # @Global() — registra tudo num lugar
├── capability-registry.service.ts  # Registry centralizado de tools, skills, agents
├── types/
│   └── capability.types.ts         # CapabilityDefinition, ToolCapability, SkillCapability, AgentCapability
├── slices/
│   ├── tools.slice.ts              # Estado das tools (registradas, ativas, isoladas)
│   ├── skills.slice.ts             # Estado das skills (carregadas, resolvidas)
│   └── agents.slice.ts             # Estado dos agents (definidos, resolvidos, subagentes)
└── index.ts
```

**Como funciona**:
- `AgentCapabilitiesModule` é `@Global()` — disponível em qualquer lugar sem import
- Cada módulo registra suas capacidades no `CapabilityRegistry` via `onModuleInit`
- `CoreModule` e `ReplModule` consultam o registry — **sem importar** os módulos originais
- Resultado: `ToolsModule`, `SkillsModule`, `AgentsModule` **não se importam mutuamente**

**Antes** (circular):
```
ToolsModule → SkillsModule → ToolsModule  ❌
AgentsModule → SkillsModule → ToolsModule → AgentsModule  ❌
```

**Depois** (hub-and-spoke):
```
ToolsModule    → CapabilityRegistry  → ToolsModule precisa de nada
SkillsModule   → CapabilityRegistry  → SkillsModule precisa de nada
AgentsModule   → CapabilityRegistry  → AgentsModule precisa de nada
CoreModule     → CapabilityRegistry  → CoreModule precisa só do registry
```

#### 1.2. Refatorar `ToolsRegistryService`

```typescript
// ANTES: importa TaskToolsService, MemoryToolsService, etc.
constructor(
  private readonly taskTools: TaskToolsService,
  private readonly memoryTools: MemoryToolsService,
  // ... mais 4 imports com forwardRef
) { ... }

// DEPOIS: registra via CapabilityRegistry, sem imports
constructor(
  private readonly registry: CapabilityRegistryService,
) {
  this.registry.registerTools('filesystem', () => this.filesystemTools.getTools());
  this.registry.registerTools('shell', () => this.shellTools.getTools());
  // ... cada módulo de ferramenta registra suas próprias tools
}
```

#### 1.3. Refatorar `SkillRegistryService`

```typescript
// ANTES: importa ToolsRegistryService com forwardRef
constructor(
  private readonly toolsRegistry: ToolsRegistryService,  // ❌ forwardRef
) { ... }

// DEPOIS: consulta CapabilityRegistry
constructor(
  private readonly registry: CapabilityRegistryService,
) { ... }

resolveSkill(name: string): ResolvedSkill {
  const skill = this.skillLoader.getSkill(name);
  const tools = this.registry.resolveTools(skill.tools);  // ✅ sem forwardRef
  return { ...skill, tools };
}
```

#### 1.4. Refatorar `AgentRegistryService`

```typescript
// ANTES: importa SkillRegistryService + ToolsRegistryService + McpRegistryService
// DEPOIS: importa só CapabilityRegistryService
```

**Critério de sucesso**:
- `grep -r "forwardRef" src/modules/` retorna 0 resultados
- Cada módulo importa apenas `CapabilityRegistryService` (do módulo `@Global()`)

---

### Fase 2: Skill Injection Direta no Agente Principal
**Problema**: Skills só são acessíveis via `list_skills` → `read_skill` (2 tool calls), o que cria fricção desnecessária.

**Solução RTK-inspired**: Assim como RTK Query declara endpoints com `providesTags` e `invalidatesTags`, skills devem declarar **quando são relevantes** e serem injetadas proativamente.

#### 2.1. Adicionar `triggers` ao Skill Frontmatter

```yaml
# ANTES
name: react-best-practices
description: React best practices and patterns
tools: [read_file, edit_file]

# DEPOIS
name: react-best-practices
description: React best practices and patterns
tools: [read_file, edit_file]
triggers:
  - keywords: ["react", "jsx", "component", "hook", "useState", "useEffect"]
    confidence: 0.8
  - file_patterns: ["**/*.tsx", "**/*.jsx", "src/components/**"]
    confidence: 0.9
  - intent: "create_component"
    confidence: 0.7
```

#### 2.2. Criar `SkillActivationService`

```typescript
@Injectable()
export class SkillActivationService {
  // Analisa a mensagem do usuário e determina skills relevantes
  activateSkills(message: string, context: AgentContext): ResolvedSkill[] {
    const allSkills = this.skillLoader.getAllSkills();
    const scored = allSkills.map(skill => ({
      skill,
      score: this.scoreRelevance(skill, message, context),
    }));
    // Auto-ativa skills acima do threshold
    return scored
      .filter(s => s.score > 0.7)
      .map(s => this.skillRegistry.resolve(s.skill.name));
  }
}
```

#### 2.3. Injetar Skills Ativas no System Prompt

```typescript
// No buildContextualPrompt do DeepAgentService:
const activeSkills = this.skillActivation.activateSkills(message, {
  projectRoot: this.projectRoot,
  currentFiles: this.getRecentFiles(),
});

if (activeSkills.length > 0) {
  // Injeta as tools das skills ATIVAS diretamente no agent
  const skillTools = activeSkills.flatMap(s => s.tools);
  tools = [...extraTools, ...mcpTools, ...mcpDiscoveryTools, ...skillTools];

  // Adiciona seção de skills ativas ao prompt
  parts.push(this.buildActiveSkillsSection(activeSkills));
}
```

**Resultado**: Se o usuário fala em "criar um componente React", a skill `react-best-practices` é ativada automaticamente e suas tools ficam disponíveis — zero tool calls extras.

---

### Fase 3: Unified HTTP Server Pattern
**Problema**: 3 padrões diferentes de servidor HTTP (NestJS Controller, raw `http.createServer` em Kanban, raw `http.createServer` em Remote).

**Solução**: Trazer Kanban e Remote para controllers NestJS.

#### 3.1. Kanban → NestJS Controller

```typescript
// ANTES: http.createServer no KanbanServerService
// DEPOIS:
@Controller('/kanban')
export class KanbanController {
  @Get()
  getBoard(): KanbanBoardDto { ... }

  @Get('/events')
  @Sse()
  getEvents(): Observable<MessageEvent> { ... }

  @Post('/tasks')
  createTask(@Body() dto: CreateTaskDto): TaskDto { ... }
}
```

#### 3.2. Remote → NestJS Controller + SSE Guard

```typescript
@Controller('/remote')
@UseGuards(AuthTokenGuard)  // Auth via NestJS guards!
export class RemoteController {
  @Get('/chat')
  @Sse()
  chatStream(@Query('token') token: string): Observable<MessageEvent> { ... }

  @Post('/message')
  async sendMessage(@Body() dto: RemoteMessageDto): Promise<void> { ... }
}
```

**Benefício**: Guards, interceptors, exception filters, e DI middleware funcionam em todos os endpoints.

---

### Fase 4: RTK-style Entity & Cache System
**Problema**: Estado espalhado em Maps, JSON files, e SQLite sem padrão unificado.

**Solução**: Criar um sistema de entity storage inspirado no RTK Entity Adapter + RTK Query cache.

#### 4.1. Criar `EntityStore` (inspirado em `createEntityAdapter`)

```typescript
// src/shared/entity-store/entity-store.ts

export interface EntityState<T> {
  ids: string[];
  entities: Record<string, T>;
}

export class EntityStore<T extends { id: string }> {
  private state: EntityState<T> = { ids: [], entities: {} };

  addOne(entity: T) { ... }
  addMany(entities: T[]) { ... }
  updateOne(id: string, changes: Partial<T>) { ... }
  removeOne(id: string) { ... }
  removeAll() { ... }
  selectById(id: string): T | undefined { ... }
  selectAll(): T[] { ... }
}
```

#### 4.2. Criar `CapabilityCache` (inspirado em RTK Query)

```typescript
// src/shared/capability-cache/capability-cache.ts

export interface CacheEntry<T> {
  data: T;
  tags: string[];
  subscribers: number;
  lastAccessed: number;
  dirty: boolean;
}

export class CapabilityCache {
  private entries = new Map<string, CacheEntry<any>>();

  // Tag-based invalidation (RTK Query style)
  invalidateByTag(tag: string) {
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag)) {
        entry.dirty = true;
      }
    }
  }

  // Subscription-based GC (RTK Query style)
  gc() {
    for (const [key, entry] of this.entries) {
      if (entry.subscribers === 0 && Date.now() - entry.lastAccessed > 5 * 60 * 1000) {
        this.entries.delete(key);
      }
    }
  }
}
```

#### 4.3. Aplicar a Tasks, Memories, e Events

```typescript
// TasksModule usa EntityStore<Task>
// RoomsModule usa EntityStore<CastEvent>
// LTM usa EntityStore<MemoryEntry>
```

---

### Fase 5: ReplModule — Dynamic Command Registry
**Problema**: ReplModule importa 16 de 22 módulos com handlers hard-coded.

**Solução**: Padrão plugin com registro dinâmico.

#### 5.1. Criar `CommandRegistryService`

```typescript
@Injectable()
export class CommandRegistryService {
  private commands = new Map<string, CommandHandler>();

  register(group: string, handler: CommandHandler) {
    this.commands.set(group, handler);
  }

  async execute(group: string, args: string[]): Promise<string> {
    const handler = this.commands.get(group);
    if (!handler) throw new Error(`Command group "${group}" not found`);
    return handler.execute(args);
  }
}
```

#### 5.2. Cada módulo registra seus próprios comandos

```typescript
// No GitModule:
onModuleInit() {
  this.commandRegistry.register('commit', new CommitCommandHandler(this.commitService));
  this.commandRegistry.register('pr', new PrCommandHandler(this.prService));
  this.commandRegistry.register('review', new ReviewCommandHandler(this.reviewService));
}

// No ReplModule:
// Só importa o CommandRegistryService — sem saber quais comandos existem
async handleCommand(group: string, args: string[]) {
  return this.commandRegistry.execute(group, args);
}
```

**Resultado**: Adicionar um novo comando = registrar no módulo. Zero mudanças no ReplModule.

---

### Fase 6: Prompt System Modular
**Problema**: `buildSystemPrompt()` tem ~500 linhas de string concatenada com 19 seções hard-coded.

**Solução**: Prompt builders modulares com composição via capability slices.

#### 6.1. Criar `PromptBuilderService`

```typescript
@Injectable()
export class PromptBuilderService {
  private sections = new Map<string, PromptSection>();

  register(id: string, section: PromptSection) {
    this.sections.set(id, section);
  }

  build(context: BuildContext): string {
    const active = this.filterActiveSections(context);
    return active
      .map(section => section.render(context))
      .filter(Boolean)
      .join('\n\n');
  }
}
```

#### 6.2. Cada seção é independente

```typescript
// tools-section.builder.ts
export class ToolsSectionBuilder implements PromptSection {
  render(ctx: BuildContext): string {
    if (ctx.tools.length === 0) return '';
    return `# Available Tools\n${ctx.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`;
  }
}

// subagents-section.builder.ts
export class SubAgentsSectionBuilder implements PromptSection {
  render(ctx: BuildContext): string {
    if (ctx.subagents.length === 0) return '';
    // ...
  }
}
```

---

## Ordem de Execução

| Fase | Escopo | Impacto | Complexidade |
|---|---|---|---|
| **1. Capability Module** | Eliminar 8 forwardRef cycles | 🔴 Crítico | 🟡 Média |
| **2. Skill Activation** | Skills injetadas automaticamente | 🔴 Crítico | 🟡 Média |
| **3. Unified HTTP** | Kanban + Remote → NestJS | 🟡 Importante | 🟢 Baixa |
| **4. Entity Store** | Padronizar state management | 🟡 Importante | 🟡 Média |
| **5. Command Registry** | ReplModule com 16 → 2 imports | 🟢 Desejável | 🟢 Baixa |
| **6. Prompt Builders** | 500 linhas → módulos de 50-80 | 🟢 Desejável | 🟢 Baixa |

---

## Critérios de Sucesso

1. ✅ `grep -r "forwardRef" src/` retorna **0 resultados**
2. ✅ Skills ativas são injetadas sem `list_skills` + `read_skill` manual
3. ✅ Todos os HTTP endpoints usam NestJS controllers + guards
4. ✅ ReplModule importa ≤ 5 módulos (CoreModule, CommandRegistry, Theme, I18n)
5. ✅ `buildSystemPrompt` tem ≤ 100 linhas (delegando para section builders)
6. ✅ EntityStore unifica Tasks, Memories, Events com API consistente

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| CapabilityRegistry vira um "God Service" | Manter registry como facade — cada módulo gerencia seu próprio state |
| Skill activation com false positives | Threshold configurável por skill + override manual do usuário |
| Refatorar HTTP servers quebra clientes existentes | Versionar API (`/v2/kanban`, `/v2/remote`) e manter compatibilidade |
| Prompt builders adicionam complexidade | Começar com as 5 seções maiores primeiro, migrar gradualmente |

---

## Timeline Sugerida

```
Fase 1 → 2 sprints (capability module + refatorar 3 módulos)
Fase 2 → 1 sprint  (skill activation com triggers)
Fase 3 → 1 sprint  (HTTP unification)
Fase 4 → 2 sprints (entity store + aplicar a 3 módulos)
Fase 5 → 1 sprint  (command registry)
Fase 6 → 1 sprint  (prompt builders)

Total: ~8 sprints
```
