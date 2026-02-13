# Plano de Ação: Cast Code → Espelho do Claude Code

## Diagnóstico dos Problemas

Após análise completa do código-fonte, identifiquei as causas-raiz de cada problema reportado:

---

## FASE 1: Corrigir SmartInput (Autocomplete + Navegação)

### 1.1 — Setas não navegam nas sugestões de `/`

**Causa-raiz:** Em `smart-input.ts:293-296`, após QUALQUER tecla (incluindo setas), se `needsRender=true`, o método `computeSuggestions()` é chamado. Na linha 443, `computeSuggestions()` SEMPRE reseta `this.selectedIndex = -1`. Resultado: a seta move o index, mas `computeSuggestions()` imediatamente o desfaz.

**Correção:**
- Separar a lógica: só chamar `computeSuggestions()` quando o BUFFER muda (caractere digitado, backspace, delete)
- Teclas de navegação (setas, Tab) NÃO devem recomputar sugestões
- Adicionar flag `bufferChanged` para controlar quando recomputar

**Arquivos:** `src/modules/repl/services/smart-input.ts`

### 1.2 — Tab não completa e buga o terminal

**Causa-raiz:** `keyTab()` (linha 365) na primeira vez apenas seta `selectedIndex=0` sem aceitar. Na segunda vez chama `acceptSuggestion()` + `computeSuggestions()`. Mas como `computeSuggestions()` é chamado no final do loop principal (bug 1.1), o selectedIndex reseta.

**Correção:**
- Tab com sugestões visíveis: se nenhuma selecionada, selecionar a primeira. Se já tem uma selecionada, aceitar e completar.
- Tab sem sugestões: não fazer nada (sem efeito colateral no terminal)
- Garantir que Tab não escreve `\t` no buffer (já está ok, mas verificar edge cases)

**Arquivos:** `src/modules/repl/services/smart-input.ts`

### 1.3 — `@` não lista arquivos do diretório atual

**Causa-raiz:** O `getFileEntries()` em `repl.service.ts:155-185` funciona, MAS:
- Filtra dotfiles por padrão (linha 170)
- Usa `startsWith(prefix)` para filtrar — se o usuário digita `@src/`, o `partial='src/'`, `dir='src'`, `prefix=''`, o que deveria funcionar
- Porém a regex `/@([\w./:~\-]*)$/` (smart-input.ts:450) não captura espaços ou caracteres especiais nos nomes

**Correção:**
- Expandir a regex do `@` para incluir mais caracteres
- Após digitar `@` e aceitar um diretório (ex: `@src/`), continuar mostrando o conteúdo desse diretório (navegação recursiva)
- Aumentar o limite de 20 para 30 entradas
- Mostrar ícones de tipo (📁 dir, 📄 file) nas sugestões

**Arquivos:** `src/modules/repl/services/smart-input.ts`, `src/modules/repl/services/repl.service.ts`

### 1.4 — `@.service` não faz match por conteúdo (fuzzy/regex)

**Causa-raiz:** `getFileEntries()` usa `e.name.startsWith(prefix)` (linha 171) — é match por PREFIXO, não por conteúdo. Digitar `@.service` procura arquivos que COMEÇAM com `.service`, que não existem.

**Correção:**
- Implementar busca fuzzy: se o partial não contém `/`, buscar recursivamente com glob `**/*${partial}*`
- Se contém `/`, usar a navegação diretória atual
- Ex: `@.service` → encontra `app.service.ts`, `config.service.ts`, etc.
- Ex: `@src/` → lista conteúdo de src/
- Limitar a busca recursiva a 2 níveis de profundidade para performance

**Arquivos:** `src/modules/repl/services/repl.service.ts`

---

## FASE 2: Corrigir Ferramentas de Filesystem (Diretório de trabalho)

### 2.1 — Agent não encontra arquivos ao listar

**Causa-raiz:** As ferramentas usam `process.cwd()` que está CORRETO. Mas o problema pode ser:
1. O agent não passa o argumento correto (não passa nada, e o default funciona)
2. O glob tool retorna paths relativos sem contexto, o agent pode não entender
3. O system prompt precisa enfatizar mais que TODAS as ferramentas operam no diretório de trabalho

**Correção:**
- Melhorar output do `ls` e `glob` para incluir o caminho absoluto no header
- Adicionar ao system prompt: "Your working directory is {cwd}. All relative paths in tool outputs are relative to this directory."
- Validar que `glob` resolve o cwd corretamente quando recebe path relativo
- Adicionar try/catch no regex do `grep` para não crashar com regex inválido

**Arquivos:** `src/modules/tools/services/filesystem-tools.service.ts`, `src/modules/core/services/deep-agent.service.ts`

---

## FASE 3: Detalhes de Tool Calling + Token Usage

### 3.1 — Mostrar retorno das tools e pensamento da IA

**Causa-raiz:** Em `deep-agent.service.ts:319-353`, o `on_tool_start` só mostra detalhes para 7 tools (read_file, write_file, edit_file, glob, grep, shell, ls). Faltam 13 tools. O `on_tool_end` mostra apenas 3 linhas truncadas. Não há exibição do "pensamento" do modelo.

**Correção:**
- Adicionar formatação para TODAS as 20 tools no `on_tool_start`
- Melhorar `on_tool_end`:
  - Mostrar output formatado com cores (verde=sucesso, vermelho=erro)
  - Para `read_file`: mostrar "Read 45 lines from src/main.ts"
  - Para `glob`: mostrar "Found 12 files matching **/*.ts"
  - Para `shell`: mostrar comando + output resumido
  - Para `edit_file`: mostrar diff-like preview (old → new)
- Adicionar captura de `on_chat_model_start` para mostrar quando o modelo está "pensando"
- Se o modelo emite tool_use blocks com reasoning, exibir como texto dim
- Estrutura visual similar ao Claude Code:
  ```
  ⏿ read_file src/main.ts
      (45 lines)
  ⏿ edit_file src/main.ts
      - old: const x = 1;
      + new: const x = 2;
  ⏿ shell npm test
      ✓ 12 tests passed
  ```

**Arquivos:** `src/modules/core/services/deep-agent.service.ts`, `src/modules/repl/services/repl.service.ts`

### 3.2 — Contagem de tokens por interação

**Causa-raiz:** `deep-agent.service.ts:22` tem `private tokenCount = 0` mas nunca é atualizado. O LangChain emite eventos com metadata de tokens que não estão sendo capturados.

**Correção:**
- Capturar `on_llm_end` events que contêm `response.llmOutput.tokenUsage`
- Acumular tokens por interação: input_tokens, output_tokens, total
- Após cada resposta, exibir no REPL:
  ```
  ─ tokens: 1,234 in / 567 out (total session: 15,678)
  ```
- Adicionar método `getTokenUsage()` no DeepAgentService
- Mostrar no `/context` command também

**Arquivos:** `src/modules/core/services/deep-agent.service.ts`, `src/modules/repl/services/repl.service.ts`

---

## FASE 4: Melhorar System Prompt para Execução Completa

### 4.1 — Prompt para exploração completa do projeto

**Causa-raiz:** O system prompt atual (linhas 147-293) é genérico. Não instrui o agent a ser EXAUSTIVO quando o usuário pede para "entender o projeto". Claude Code tem instruções específicas para isso.

**Correção:** Adicionar seções ao system prompt:

1. **Exploration Protocol**: Quando o usuário pede para "entender/analisar/explorar" o projeto:
   - PRIMEIRO: ls na raiz, ler package.json/pyproject.toml/Cargo.toml
   - SEGUNDO: glob para encontrar a estrutura de diretórios
   - TERCEIRO: ler arquivos-chave (main, config, README)
   - QUARTO: mapear dependências e padrões
   - QUINTO: apresentar resumo estruturado

2. **Plan Mode Directive**: Para tarefas complexas (>3 arquivos afetados):
   - SEMPRE entrar em plan_mode antes de executar
   - Listar todos os arquivos que serão modificados
   - Explicar a abordagem
   - Pedir confirmação

3. **Execution Thoroughness**: Instruções para:
   - Não parar no primeiro erro, tentar alternativas
   - Sempre verificar o resultado após uma mudança (ler o arquivo de volta)
   - Rodar testes se existirem
   - Fazer commit atomics sugeridos

4. **Tool Chain Patterns**: Padrões comuns como:
   - "Para encontrar algo: glob → grep → read_file"
   - "Para editar: read_file → edit_file → read_file (verificar)"
   - "Para entender: ls → glob → read_file (múltiplos) → summarize"

**Arquivos:** `src/modules/core/services/deep-agent.service.ts`

---

## FASE 5: Sub-agents com Skills Isoladas

### 5.1 — Sub-agents recebem TODOS os tools (bug)

**Causa-raiz:** Em `deep-agent.service.ts:91`, `tools: [...tools, ...mcpTools]` é passado para createDeepAgent. Todos os sub-agents herdam TODAS as tools. O `agentRegistry.getSubagentDefinitions()` (agent-registry.service.ts:53-62) retorna as tools do skill, MAS o createDeepAgent pode estar ignorando isso.

**Correção:**
- Em `getSubagentDefinitions()`, cada agent deve APENAS ter as tools das suas skills
- Adicionar fallback: se agent não tem skills definidas, dar tools básicas (read_file, ls, glob, grep)
- NÃO dar shell, write_file, edit_file a agents que não têm skill de "file-editor" ou "shell-executor"
- Mostrar na criação do agent quais tools ele receberá

### 5.2 — Mostrar skills dos agents no REPL

**Correção:**
- No `/agents` command, mostrar as skills de cada agent
- No `/agents <name>`, mostrar detalhes completos incluindo tools disponíveis
- Formato:
  ```
  Agents (3):
    code-reviewer    Review code quality     [code-analysis, file-ops]
    file-editor      Edit project files      [file-ops, shell]
    researcher       Research and explore    [web-search, file-ops]
  ```

### 5.3 — Criar agents built-in padrão

**Correção:** Criar agent definitions em `src/modules/agents/definitions/`:
- `code-reviewer.md` — skills: [code-analysis, file-ops]
- `file-editor.md` — skills: [file-ops, shell-ops]
- `researcher.md` — skills: [web-ops, file-ops]
- `planner.md` — skills: [file-ops, task-management]

E skills em `src/modules/skills/definitions/`:
- `code-analysis.md` — tools: [read_file, glob, grep, ls]
- `file-ops.md` — tools: [read_file, write_file, edit_file, glob, grep, ls]
- `shell-ops.md` — tools: [shell, shell_background]
- `web-ops.md` — tools: [web_search, web_fetch]
- `task-management.md` — tools: [task_create, task_update, task_list, task_get, enter_plan_mode, exit_plan_mode]

**Arquivos:** `src/modules/agents/definitions/*.md`, `src/modules/skills/definitions/*.md`, `src/modules/agents/services/agent-registry.service.ts`

---

## FASE 6: Melhorar MCP

### 6.1 — Fix JSON chunking no stdio

**Causa-raiz:** `mcp-client.service.ts:93-99` faz `JSON.parse(message)` assumindo que cada `data` event contém um JSON completo. Stdio pode fragmentar.

**Correção:**
- Adicionar buffer por conexão
- Acumular dados até encontrar `\n` (newline-delimited JSON)
- Parsear cada linha completa separadamente
- Adicionar timeout e error handling robusto

### 6.2 — Fix HTTP mode JSON-RPC

**Causa-raiz:** `mcp-client.service.ts:149-156` envia body sem campos JSON-RPC obrigatórios.

**Correção:**
- Enviar formato correto: `{ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments } }`
- Adicionar headers de autenticação (Bearer token) opcional
- Implementar retry com backoff

### 6.3 — Reconexão automática

**Correção:**
- Monitorar `close` event do processo stdio
- Implementar reconexão com backoff exponencial (1s, 2s, 4s, max 30s)
- Mostrar status no REPL quando MCP desconecta/reconecta
- Adicionar `/mcp status` para ver health de cada conexão

### 6.4 — Implementar SSE transport (stub atual)

**Correção:**
- Implementar `connectSse()` usando EventSource ou fetch com streaming
- Seguir spec MCP para SSE transport
- Ou: remover a opção e mostrar erro claro "SSE not yet supported"

**Arquivos:** `src/modules/mcp/services/mcp-client.service.ts`, `src/modules/mcp/services/mcp-registry.service.ts`

---

## FASE 7: Comando `/project` - Análise de Contexto ✅ CONCLUÍDO

### 7.1 — Implementar análise universal de projeto

**Status:** ✅ CONCLUÍDO

**Implementação:**
- Criado `ProjectAnalyzerService` que detecta qualquer linguagem/framework via file patterns
- Suporte a: TypeScript, JavaScript, Python, Go, Rust, Java, PHP, Ruby, C#, e mais
- Detecta arquiteturas: Layered, Clean, Hexagonal, Microservices, DDD, CQRS
- Analisa módulos, dependências, entry points, e estrutura

**Arquivo:** `src/modules/project/services/project-analyzer.service.ts`

### 7.2 — Comando `/project` (rápido)

**Status:** ✅ CONCLUÍDO

**Sintaxe:**
```bash
/project              # Analisa e gera/atualiza o contexto
/project analyze      # Gera .cast/context.md automaticamente
/project show         # Mostra o contexto atual
/project edit         # Abre no editor para edição
```

**Funcionalidade:**
- Análise rápida (~1-2 segundos)
- Gera `.cast/context.md` com:
  - Stack detectada
  - Estrutura de diretórios
  - Módulos principais
  - Dependências chave
  - Padrões de arquitetura
- Carregado automaticamente em todas as conversas

**Arquivo:** `src/modules/repl/services/commands/project-commands.service.ts`

### 7.3 — Comando `/project-deep` (agent instructions)

**Status:** ✅ CONCLUÍDO

**Sintaxe:**
```bash
/project-deep         # Análise profunda com instruções para agente
```

**Funcionalidade:**
- Gera `.cast/context.md` (contexto básico)
- Gera `.cast/agent-instructions.md` com tarefas detalhadas para um agente de IA:
  1. Explore a estrutura do projeto
  2. Analise cada módulo em profundidade
  3. Documente padrões e convenções
  4. Identifique fluxos de dados
  5. Gere sumário executivo
- Instruções podem ser copiadas para uma nova conversa com agente especialista

### 7.4 — Resolver conflitos de stdin

**Status:** ✅ CONCLUÍDO

**Problema:** REPL capturava input durante prompts do inquirer

**Solução:**
- Adicionado `pause()`/`resume()` no `SmartInput`
- Todos os comandos interativos pausam antes de usar inquirer
- Métodos `pause()` removem listeners e desativam raw mode
- Métodos `resume()` restauram listeners e reativam raw mode

**Arquivos:** 
- `src/modules/repl/services/smart-input.ts`
- `src/modules/repl/services/commands/project-commands.service.ts`
- `src/modules/repl/services/commands/mcp-commands.service.ts`
- `src/modules/config/services/config-commands.service.ts`

---

## Ordem de Execução

| Prioridade | Fase | Impacto | Estimativa de Complexidade |
|-----------|------|---------|---------------------------|
| 🔴 P0 | 1.1 + 1.2 | Setas + Tab quebrados = inutilizável | Baixa |
| 🔴 P0 | 1.3 + 1.4 | @ autocomplete não funciona | Média |
| 🟡 P1 | 2.1 | Agent não acha arquivos | Baixa |
| 🟡 P1 | 3.1 | Sem visibilidade das tools | Média |
| 🟡 P1 | 3.2 | Sem contagem de tokens | Baixa |
| 🟢 P2 | 4.1 | Prompt melhor | Média |
| 🟢 P2 | 5.1 + 5.2 + 5.3 | Sub-agents isolados | Alta |
| 🔵 P3 | 6.1 + 6.2 + 6.3 | MCP robusto | Alta |

**Sugestão de execução:** P0 → P1 → P2 → P3 (sequencial, pois cada fase pode revelar issues na próxima)

---

## Resumo de Arquivos Modificados

| Arquivo | Fases |
|---------|-------|
| `src/modules/repl/services/smart-input.ts` | 1.1, 1.2, 1.3, 7.4 |
| `src/modules/repl/services/repl.service.ts` | 1.3, 1.4, 3.1, 3.2, 5.2, 7.2, 7.3 |
| `src/modules/core/services/deep-agent.service.ts` | 2.1, 3.1, 3.2, 4.1, 5.1 |
| `src/modules/tools/services/filesystem-tools.service.ts` | 2.1 |
| `src/modules/agents/services/agent-registry.service.ts` | 5.1 |
| `src/modules/mcp/services/mcp-client.service.ts` | 6.1, 6.2, 6.3 |
| `src/modules/mcp/services/mcp-registry.service.ts` | 6.2 |
| `src/modules/agents/definitions/*.md` (novos) | 5.3 |
| `src/modules/skills/definitions/*.md` (novos) | 5.3 |
| `src/modules/project/services/project-analyzer.service.ts` (novo) | 7.1, 7.2, 7.3 |
| `src/modules/repl/services/commands/project-commands.service.ts` (novo) | 7.2, 7.3, 7.4 |
| `src/modules/repl/services/commands/mcp-commands.service.ts` | 7.4 |
| `src/modules/config/services/config-commands.service.ts` | 7.4 |
