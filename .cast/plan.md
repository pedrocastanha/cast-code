# Plano de Implementação: Cast Code → Claude Code Level

## Problema Principal
O assistente diz que arquivos não existem quando existem. Isso acontece porque:
1. O system prompt não instrui fortemente o modelo a USAR tools antes de responder
2. Não há sistema de mentions para injetar contexto de arquivos/pastas
3. O read_file não resolve caminhos relativos ao projeto
4. O grep é limitado (100 arquivos, sem context lines)

## Visão Geral das Mudanças

### FASE 1: Mentions System + Fix de Inteligência

#### 1.1 - MentionsService (NOVO)
**Arquivo:** `src/modules/mentions/services/mentions.service.ts`

Pré-processa o input do usuário antes de enviar ao LLM:
- `@path/to/file.ts` → Lê o arquivo e injeta conteúdo na mensagem
- `@path/to/folder/` → Lista diretório e injeta estrutura
- `@https://url.com` → Fetch da URL e injeta conteúdo
- `@git:status` → Injeta output de git status
- `@git:diff` → Injeta output de git diff

Exemplo de transformação:
```
Input: "O que está nesse arquivo? @src/main.ts"

Transforma em:
"O que está nesse arquivo?

<file path="src/main.ts">
1: import 'reflect-metadata';
2: import { config } from 'dotenv';
...
</file>"
```

**Arquivos a criar:**
- `src/modules/mentions/mentions.module.ts`
- `src/modules/mentions/services/mentions.service.ts`
- `src/modules/mentions/types/mention.types.ts`

#### 1.2 - System Prompt Avançado
**Arquivo:** `src/modules/core/services/deep-agent.service.ts`

Reescrever `buildSystemPrompt()` para ser muito mais inteligente:
- Instruções detalhadas de como usar cada tool
- Regras de quando usar qual tool
- Git safety protocol
- Instruções de estilo de resposta
- Working directory e environment info
- Git status do projeto (snapshot)

#### 1.3 - Melhoria do read_file
**Arquivo:** `src/modules/tools/services/filesystem-tools.service.ts`

- Resolver caminhos relativos ao cwd do projeto
- Verificar se path é diretório (e sugerir ls)
- Truncar linhas longas (>2000 chars)
- Retornar warning se arquivo vazio
- Suporte a detecção de binários

#### 1.4 - Melhoria do grep
**Arquivo:** `src/modules/tools/services/filesystem-tools.service.ts`

- Adicionar context lines (-A, -B, -C)
- Case sensitive/insensitive toggle
- Aumentar limite de arquivos (100 → 500)
- Aumentar limite de resultados (50 → 200)
- Excluir node_modules, .git, dist por padrão
- Suporte a output_mode (content, files_with_matches, count)

#### 1.5 - Melhoria do edit_file
**Arquivo:** `src/modules/tools/services/filesystem-tools.service.ts`

- Validar que old_string !== new_string
- Verificar que arquivo foi lido antes de editar (track reads)

### FASE 2: Slash Commands + REPL Avançado

#### 2.1 - Sistema de Slash Commands Expandido
**Arquivo:** `src/modules/repl/services/repl.service.ts`

Adicionar commands:
- `/compact` - Limpar histórico mantendo resumo
- `/status` - Git status
- `/diff` - Git diff
- `/log` - Git log recente
- `/mcp list` - Listar MCPs conectados
- `/mcp add <name>` - Adicionar MCP
- `/tools` - Listar tools disponíveis
- `/agents` - Listar agents disponíveis
- `/context` - Mostrar contexto do projeto
- `/cost` - Mostrar tokens usados na sessão

#### 2.2 - REPL com Markdown Rendering
**Arquivo:** `src/modules/repl/services/repl.service.ts`

- Syntax highlighting para blocos de código
- Formatação de headers, bold, italic
- Feedback visual de tool calls (spinner + nome da tool)
- Mostrar progresso de tasks
- Mostrar contexto de mentions expandidos

### FASE 3: Planning Mode + Memory

#### 3.1 - Planning Mode Tools
**Arquivo:** `src/modules/tasks/services/task-tools.service.ts`

Adicionar tools:
- `enter_plan_mode` - Entrar em modo planejamento
- `exit_plan_mode` - Sair e apresentar plano para aprovação

#### 3.2 - Auto Memory System
**Arquivos:**
- `src/modules/memory/memory.module.ts`
- `src/modules/memory/services/memory.service.ts`

Sistema de memória persistente:
- Diretório `~/.cast/projects/<hash>/memory/`
- MEMORY.md carregado no system prompt
- Tools: `memory_write`, `memory_read`, `memory_search`

### FASE 4: MCP Management

#### 4.1 - MCP Commands via Terminal
**Arquivo:** `src/modules/repl/services/repl.service.ts`

- `/mcp add <name> --stdio <command>` → Adicionar MCP server
- `/mcp add <name> --http <endpoint>` → Adicionar MCP HTTP
- `/mcp list` → Listar MCPs
- `/mcp remove <name>` → Remover MCP
- `/mcp test <name>` → Testar conexão

## Ordem de Implementação

1. **MentionsService** (resolve o bug principal)
2. **System Prompt reescrito** (melhora inteligência)
3. **Tools melhoradas** (read_file, grep, edit_file)
4. **Slash Commands** (UX)
5. **REPL melhorado** (feedback visual)
6. **Planning Mode** (workflow)
7. **Memory System** (persistência)
8. **MCP Management** (gerenciamento)

## Arquivos que Serão Modificados
- `src/modules/core/services/deep-agent.service.ts` (system prompt)
- `src/modules/tools/services/filesystem-tools.service.ts` (read, grep, edit)
- `src/modules/repl/services/repl.service.ts` (mentions, commands, UI)
- `src/modules/tasks/services/task-tools.service.ts` (plan tools)
- `src/common/constants/index.ts` (novas constantes)
- `src/app.module.ts` (novos modules)

## Arquivos que Serão Criados
- `src/modules/mentions/mentions.module.ts`
- `src/modules/mentions/services/mentions.service.ts`
- `src/modules/mentions/types/mention.types.ts`
- `src/modules/memory/memory.module.ts`
- `src/modules/memory/services/memory.service.ts`
- `src/modules/memory/types/memory.types.ts`
