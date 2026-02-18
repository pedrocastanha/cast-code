# Cast Code — Arquitetura Detalhada

> Este documento explica cada módulo do Cast Code: o que faz, por que existe, como foi construído, como se conecta ao restante do sistema, e por que não deveria ser diferente. O objetivo é que qualquer desenvolvedor — iniciante ou não — consiga ler isso e entender o projeto de ponta a ponta.

---

## Índice

1. [Visão geral do sistema](#1-visão-geral-do-sistema)
2. [Como o projeto sobe](#2-como-o-projeto-sobe-maintsappmodulets)
3. [Common — a caixa de ferramentas compartilhada](#3-common--a-caixa-de-ferramentas-compartilhada)
4. [Config — guardando preferências do usuário](#4-config--guardando-preferências-do-usuário)
5. [REPL — o terminal interativo](#5-repl--o-terminal-interativo)
6. [Core — o cérebro com IA](#6-core--o-cérebro-com-ia)
7. [Agents — especialistas que o agente pode chamar](#7-agents--especialistas-que-o-agente-pode-chamar)
8. [Skills — habilidades e conjuntos de ferramentas](#8-skills--habilidades-e-conjuntos-de-ferramentas)
9. [Tools — as mãos do agente](#9-tools--as-mãos-do-agente)
10. [MCP — conexão com ferramentas externas](#10-mcp--conexão-com-ferramentas-externas)
11. [Project — entendendo o repositório do usuário](#11-project--entendendo-o-repositório-do-usuário)
12. [Git — operações de versionamento com IA](#12-git--operações-de-versionamento-com-ia)
13. [Tasks — planejamento e execução de tarefas](#13-tasks--planejamento-e-execução-de-tarefas)
14. [Memory — memória persistente por projeto](#14-memory--memória-persistente-por-projeto)
15. [Mentions — injeção de contexto via @](#15-mentions--injeção-de-contexto-via-)
16. [Permissions — controle de comandos perigosos](#16-permissions--controle-de-comandos-perigosos)
17. [Como os módulos se comunicam](#17-como-os-módulos-se-comunicam)
18. [Fluxo completo de uma mensagem](#18-fluxo-completo-de-uma-mensagem)
19. [Fluxo completo de um comando /commit](#19-fluxo-completo-de-um-comando-commit)
20. [Decisões de arquitetura e por que não seria diferente](#20-decisões-de-arquitetura-e-por-que-não-seria-diferente)

---

## 1. Visão geral do sistema

**Analogia:** imagine que o Cast é uma empresa. Tem uma recepcionista (REPL) que ouve o que você fala. Ela repassa para um gerente geral (Core/DeepAgent). O gerente tem especialistas no time (Agents), cada um com habilidades específicas (Skills), e eles usam ferramentas (Tools) para trabalhar — incluindo ferramentas externas contratadas (MCP). Quando você pede algo, o gerente decide quem faz o quê, coordena, e a recepcionista devolve o resultado para você.

```
Você (terminal)
    ↓
REPL — interpreta comandos e mensagens
    ↓
Core (DeepAgent) — pensa, planeja, delega
    ├── Agents — sub-especialistas
    ├── Skills — habilidades por domínio
    ├── Tools — filesystem, shell, busca
    └── MCP — ferramentas externas (Figma, GitHub, etc.)
    ↓
Módulos de suporte
    ├── Project — contexto do repositório
    ├── Git — operações git com IA
    ├── Memory — memória persistente
    ├── Mentions — @arquivo, @git:status...
    ├── Permissions — controle de segurança
    └── Config — configurações do usuário
```

O projeto usa **NestJS** como framework. Isso significa que todo serviço é injetado por dependência — nenhum serviço cria instâncias diretamente com `new`. O NestJS faz isso automaticamente.

**Por que NestJS?** Porque o projeto tem muitos módulos com dependências circulares potenciais. O NestJS resolve tudo isso com seu sistema de injeção de dependências — você declara o que precisa no construtor e ele entrega. Sem isso, seria necessário gerenciar manualmente quem cria quem, e em qual ordem.

---

## 2. Como o projeto sobe (`main.ts` / `app.module.ts`)

**Arquivo:** `src/main.ts`

Quando você digita `cast` no terminal, o Node executa `dist/main.js`. Aqui está o que acontece, passo a passo:

```
1. Carrega variáveis de ambiente do .env (silenciosamente)
2. Cria o contexto do NestJS (sem HTTP server — só DI)
3. Verifica se ~/.cast/config.yaml existe
4. Se não existe → roda o wizard de configuração inicial
5. Se existe → carrega as configurações
6. Inicia o ReplService (a interface interativa)
7. Aguarda SIGINT (Ctrl+C) para encerrar limpo
```

**Por que não tem servidor HTTP?** Porque o Cast é uma CLI. O NestJS normalmente sobe um servidor web, mas aqui usamos `NestFactory.createApplicationContext()` — só o sistema de injeção de dependências, sem portas abertas.

**`AppModule`** importa todos os outros módulos. É o "mapa" do projeto — diz ao NestJS quais módulos existem e precisam ser carregados.

---

## 3. Common — a caixa de ferramentas compartilhada

**Pasta:** `src/modules/common/`

**Analogia:** é o armário de materiais de escritório que todo mundo usa — canetas, papel, grampeador. Nenhum departamento precisa comprar os seus próprios.

Este módulo contém serviços usados por praticamente todos os outros módulos.

### `ConfigService`

Lê as variáveis de ambiente (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) e o arquivo `~/.cast/config.yaml`. Garante que qualquer serviço que precise de uma chave de API ou modelo configurado possa obtê-la em um único lugar.

**Por que centralizar isso?** Porque se cada serviço lesse `process.env` diretamente, seria impossível trocar a fonte de configuração depois sem alterar dezenas de arquivos.

### `MultiLlmService`

É o serviço que cria instâncias de LLM (modelos de linguagem). Em vez de cada módulo instanciar `new ChatOpenAI(...)` ou `new ChatAnthropic(...)`, eles pedem ao `MultiLlmService` um modelo para um propósito específico.

Propósitos disponíveis:
- `default` — modelo padrão para conversas
- `subAgent` — modelo para sub-agentes especializados
- `coder` — modelo para geração de código
- `architect` — modelo para decisões de arquitetura
- `reviewer` — modelo para revisão de código
- `planner` — modelo para gerar planos de tarefas
- `cheap` — modelo barato para tarefas simples (resumos, commits rápidos)

**Por que separar propósitos?** Porque o modelo mais capaz é o mais caro. Para gerar uma mensagem de commit, você não precisa de GPT-4o — um modelo mais barato resolve bem. Para revisar arquitetura, você quer o melhor disponível. Essa separação permite tunar custo vs. qualidade por tipo de tarefa.

### `MarkdownParserService`

Parseia arquivos `.md` com frontmatter YAML. Todo agente, skill e configuração de projeto é definido em markdown com metadados no topo:

```markdown
---
name: coder
description: Especialista em escrita de código
tools: [read_file, write_file, shell]
---

Você é um especialista em código. Seu trabalho é...
```

O `MarkdownParserService` separa o frontmatter (metadados) do corpo (conteúdo) e retorna os dois. Isso é usado por Agents, Skills e Project.

### `MarkdownRendererService`

Renderiza markdown no terminal com cores e formatação. Quando o agente responde com código, listas ou tabelas, este serviço converte para texto colorido usando ANSI escape codes.

---

## 4. Config — guardando preferências do usuário

**Pasta:** `src/modules/config/`

**Analogia:** é o painel de configurações do celular. Você define uma vez (qual operadora, qual plano) e o sistema inteiro usa essas preferências.

### `ConfigManagerService`

Lê e escreve o arquivo `~/.cast/config.yaml`. Este arquivo guarda:

```yaml
version: 1
providers:
  anthropic:
    apiKey: sk-ant-...
  openai:
    apiKey: sk-...
models:
  default:
    provider: anthropic
    model: claude-sonnet-4-6
  cheap:
    provider: openai
    model: gpt-4.1-nano
  reviewer:
    provider: anthropic
    model: claude-opus-4-6
```

Métodos principais:
- `loadConfig()` — carrega o YAML do disco
- `saveConfig()` — salva no disco
- `getModelConfig(purpose)` — retorna qual modelo usar para um propósito
- `getProviderConfig(name)` — retorna credenciais de um provider
- `isProviderConfigured(name)` — verifica se um provider tem chave configurada

### `InitConfigService`

Executa o wizard interativo na primeira vez que o Cast é aberto. Faz perguntas:
- Qual provider você quer usar? (OpenAI, Anthropic, Ollama...)
- Qual é a sua API key?
- Qual modelo padrão?

E salva as respostas em `~/.cast/config.yaml`.

### `ConfigCommandsService`

Implementa o comando `/config` no REPL. Permite:
- `/config show` — exibir configuração atual
- `/config add-provider` — adicionar novo provider
- `/config set-model` — trocar modelo por propósito

**Por que YAML e não JSON?** YAML é mais legível para humanos. O arquivo `~/.cast/config.yaml` pode ser editado manualmente — e YAML com comentários é muito mais amigável para isso do que JSON.

---

## 5. REPL — o terminal interativo

**Pasta:** `src/modules/repl/`

**Analogia:** é a recepção de um hotel. Você chega, fala o que quer, a recepcionista entende se é uma reclamação, um pedido de serviço, ou uma pergunta — e encaminha para a pessoa certa.

Este é o módulo mais visível do sistema. É tudo que você vê e interage.

### `ReplService`

O orquestrador central do REPL. Quando você digita algo e pressiona Enter, o fluxo é:

```
Linha digitada
    ↓
handleLine()
    ↓ (começa com /)
handleCommand()  →  roteia para o serviço de comando correto
    ↓ (mensagem normal)
handleMessage()  →  processa @mentions → envia ao DeepAgent → streama resposta
```

Métodos chave:
- `start()` — inicializa o SmartInput, exibe a tela de boas-vindas, começa a escutar
- `handleLine(line)` — decide se é comando ou mensagem
- `handleCommand(cmd, args)` — roteia `/commit`, `/mcp`, `/agents`, etc.
- `handleMessage(message)` — processa menções, verifica plan mode, chama DeepAgent
- `runInteractivePlanMode()` — loop de perguntas/respostas para refinar um plano antes de executar
- `cmdTools()` — exibe ferramentas disponíveis (built-in + MCP)

### `SmartInput`

**Analogia:** é o teclado com autocompletar do celular — mas muito mais inteligente.

O SmartInput gerencia o input em modo raw do terminal. "Modo raw" significa que cada tecla pressionada chega individualmente, antes de ser processada pelo terminal. Isso permite:

- Autocompletar comandos ao digitar `/` (mostra sugestões em tempo real)
- Completar nomes de arquivo ao digitar `@`
- Navegar no histórico de mensagens com setas ↑ ↓
- Capturar Ctrl+C, Ctrl+D, ESC sem matar o processo

**Por que modo raw e não readline padrão?** O `readline` do Node não permite sugestões visuais em tempo real. Para mostrar um menu de comandos enquanto você digita, precisa de controle total sobre o terminal — e isso só é possível em raw mode.

**Cuidado com o `pause()`:** quando o SmartInput faz `.pause()`, ele remove o listener de `data` do stdin. Isso significa que qualquer componente que dependa de input do usuário (como menus do Inquirer) precisa que o SmartInput esteja pausado antes de rodar — caso contrário os dois competem pelo mesmo stdin. O menu `/mcp` é um caso especial: ele usa o próprio SmartInput, então **não pode** ser pausado antes.

### `WelcomeScreenService`

Exibe o banner inicial ao abrir o Cast. Mostra:
- Logo ASCII
- Versão atual
- Modelo configurado
- Quantas ferramentas, agentes e skills estão disponíveis
- Servidores MCP conectados

### Serviços de Comando

Cada família de comandos tem seu próprio serviço:

| Serviço | Comandos |
|---|---|
| `ReplCommandsService` | `/help`, `/clear`, `/context`, `/model`, `/compact` |
| `GitCommandsService` | `/commit`, `/up`, `/pr`, `/review`, `/fix`, `/status`, `/diff`, `/log`, `/release` |
| `AgentCommandsService` | `/agents`, `/agents create`, `/skills`, `/skills create` |
| `McpCommandsService` | `/mcp`, `/mcp add`, `/mcp remove`, `/mcp list`, `/mcp tools` |
| `ProjectCommandsService` | `/init`, `/project-deep`, `/context` |

**Por que separar em serviços diferentes?** Porque `ReplService` já é grande. Se todos os comandos fossem implementados nele, seria um arquivo de milhares de linhas impossível de manter. Separar por domínio (git, mcp, agents...) segue o princípio de responsabilidade única.

### `theme.ts` (utilitário)

Define a paleta de cores do terminal (via ANSI codes) e ícones usados em toda a interface. Qualquer componente importa `colorize(text, 'accent')` ou `colorize(text, 'error')` para colorir texto de forma consistente.

---

## 6. Core — o cérebro com IA

**Pasta:** `src/modules/core/`

**Analogia:** é o gerente geral que recebe a tarefa, pensa no que precisa ser feito, chama os especialistas certos, e coordena o resultado.

### `DeepAgentService`

O coração do sistema. Este serviço encapsula o framework `deepagents`, que por sua vez usa LangGraph internamente para orquestrar agentes com ferramentas.

**O que o DeepAgent faz:**
1. Mantém o histórico de mensagens da conversa
2. Tem um system prompt dinâmico (inclui contexto do projeto, agentes, skills, ferramentas MCP)
3. Quando você manda uma mensagem, ele decide quais ferramentas usar
4. Se precisar de um especialista, delega para um sub-agente (Architect, Coder, Reviewer...)
5. Streama a resposta de volta token por token

Métodos principais:
- `initialize()` — carrega agentes, skills, ferramentas, MCP, contexto do projeto
- `chat(messages, onToken)` — envia mensagem, recebe stream de tokens
- `buildSystemPrompt()` — constrói o prompt do sistema com todo o contexto
- `compactHistory()` — quando o histórico fica muito longo, usa um modelo barato para resumir as mensagens antigas e manter apenas o resumo
- `clearHistory()` — apaga o histórico
- `getTokenCount()` — conta tokens usados na sessão

**Por que streaming?** Porque LLMs respondem token por token. Se esperasse a resposta completa, o terminal ficaria travado por segundos ou minutos sem feedback visual. O streaming mostra cada palavra conforme é gerada — exatamente como no ChatGPT.

### `PlanModeService`

**Analogia:** antes de construir uma casa, você faz uma planta. O Plan Mode é isso — antes de executar uma tarefa complexa, o Cast cria um plano detalhado para você aprovar.

Quando você faz uma solicitação complexa (ex: "crie todo o módulo de autenticação"), o Cast detecta que isso precisa de planejamento.

Métodos:
- `shouldEnterPlanMode(message)` — heurística + LLM para decidir se a tarefa é complexa o suficiente para planejar
- `generateClarifyingQuestions(task)` — gera perguntas para entender melhor o que você quer
- `generatePlan(task, answers)` — gera um plano estruturado com etapas
- `refinePlan(plan, feedback)` — refina o plano com base no seu feedback
- `formatPlanForDisplay(plan)` — formata para exibição no terminal

**Fluxo do Plan Mode:**
```
Você: "crie um sistema de autenticação completo"
    ↓
shouldEnterPlanMode() → "sim, isso é complexo"
    ↓
generateClarifyingQuestions() → "JWT ou sessions? Qual banco de dados?"
    ↓ (você responde)
generatePlan() → plano com 8 etapas
    ↓ (você aprova)
DeepAgent executa com o plano como contexto adicional
```

---

## 7. Agents — especialistas que o agente pode chamar

**Pasta:** `src/modules/agents/`

**Analogia:** em vez de um médico geral saber tudo, um hospital tem cardiologistas, neurologistas, ortopedistas... O DeepAgent é o clínico geral; quando precisa de algo específico, chama o especialista certo.

Agentes são definidos em arquivos `.md`:

```markdown
---
name: coder
description: Especialista em escrever e modificar código
model: claude-sonnet-4-6
temperature: 0.2
skills: [file-operations, git-operations]
---

Você é um programador experiente. Você escreve código limpo, testado e bem documentado...
```

Agentes built-in (em `src/modules/agents/definitions/`):
- `architect` — decisões de arquitetura
- `coder` — escrita e modificação de código
- `frontend` — componentes e UI
- `backend` — APIs e lógica de servidor
- `reviewer` — revisão e qualidade de código
- `tester` — testes automatizados
- `devops` — deploy e infraestrutura

### `AgentLoaderService`

Lê todos os arquivos `.md` da pasta de definições e também da pasta `.cast/agents/` do projeto atual (que o usuário pode criar para ter agentes customizados).

### `AgentRegistryService`

Resolve agentes completos: pega a definição `.md`, adiciona as ferramentas corretas (das Skills que o agente lista), e exporta no formato que o DeepAgent framework espera.

**Por que agentes em markdown?** Porque agentes são basicamente prompts + configurações. Markdown com frontmatter é o formato mais legível para isso. Um desenvolvedor pode criar um agente novo simplesmente criando um arquivo `.md` — sem precisar tocar em código TypeScript.

---

## 8. Skills — habilidades e conjuntos de ferramentas

**Pasta:** `src/modules/skills/`

**Analogia:** se agentes são profissionais, skills são as certificações deles. Um "coder" tem a skill `file-operations` (pode ler e escrever arquivos) e `git-operations` (pode commitar, fazer diff). Um "devops" tem `shell` e `cloud`.

Skills são definidas em `.md`:

```markdown
---
name: file-operations
description: Capacidade de ler, escrever e editar arquivos
tools: [read_file, write_file, edit_file, glob, grep, ls]
---

Use estas ferramentas para manipular arquivos do projeto...
```

### `SkillLoaderService`

Lê as skills de `src/modules/skills/definitions/` e também de `.cast/skills/` no projeto.

### `SkillRegistryService`

Dado um nome de skill, retorna quais ferramentas ela concede. Quando um agente diz `skills: [file-operations]`, o registry resolve isso para as ferramentas concretas `[read_file, write_file, edit_file, ...]`.

**Por que skills existem em vez de dar todas as ferramentas para todos?** Princípio do menor privilégio. Um agente de revisão de código (`reviewer`) não precisa escrever arquivos — só ler. Limitar as ferramentas por skill evita que um agente faça algo fora do seu escopo acidentalmente.

---

## 9. Tools — as mãos do agente

**Pasta:** `src/modules/tools/`

**Analogia:** ferramentas são literalmente as mãos do agente. Ele pode "pensar" (o LLM faz isso), mas para agir no mundo real — ler um arquivo, rodar um comando, buscar na web — precisa de ferramentas.

Todas as ferramentas seguem o padrão do LangChain (`StructuredTool`): têm nome, descrição, schema de input (com Zod) e uma função `_call()` que executa a ação.

### `FilesystemToolsService`

Ferramentas de arquivo:
- `read_file(path, offset?, limit?)` — lê arquivo, detecta binários
- `write_file(path, content)` — cria ou sobrescreve arquivo
- `edit_file(path, old_string, new_string)` — substitui trecho exato num arquivo
- `glob(pattern, path?)` — busca arquivos por padrão (ex: `**/*.ts`)
- `grep(pattern, path?, glob?)` — busca conteúdo dentro de arquivos
- `ls(path?)` — lista diretório com metadados

### `ShellToolsService`

- `shell(command, timeout?)` — executa comando no terminal
  - Antes de executar, passa pelo `PermissionService` para verificar se é perigoso
  - Retorna stdout + stderr
- `background_shell(command)` — executa em background, salva log

**Por que ter um timeout no shell?** Porque o agente pode gerar um comando que trava (ex: `npm install` em rede lenta). Sem timeout, o Cast ficaria bloqueado para sempre.

### `ToolsRegistryService`

Agrega todas as ferramentas em um único registro. Qualquer componente que precise de uma ferramenta pelo nome consulta o registry.

---

## 10. MCP — conexão com ferramentas externas

**Pasta:** `src/modules/mcp/`

**Analogia:** imagine que o Cast é um computador. As ferramentas built-in são os programas instalados. O MCP é como um hub USB — você conecta dispositivos externos (Figma, GitHub, Stripe, banco de dados) e eles ficam disponíveis como ferramentas adicionais.

MCP significa **Model Context Protocol** — um protocolo aberto da Anthropic para conectar LLMs a fontes de dados e ferramentas externas de forma padronizada.

### `McpRegistryService`

Gerencia todos os servidores MCP configurados pelo usuário. Quando o Cast inicia, este serviço lê todos os arquivos `.json` em `.cast/mcp/` e tenta conectar cada servidor.

Métodos:
- `connectAll()` — conecta todos os servidores configurados
- `getMcpTools(serverName)` — retorna ferramentas de um servidor como LangChain tools
- `getAllMcpTools()` — todas as ferramentas de todos os servidores
- `getServerSummaries()` — status de cada servidor (conectado, erro, etc.)
- `getConfig(name)` — retorna a configuração de um servidor
- `getAuthUrl(name)` — retorna a URL de auth OAuth de um servidor (se houver)

### `McpClientService`

Implementa o protocolo MCP. Suporta três tipos de transporte:

**stdio** (mais comum):
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "ghp_..." }
}
```
O Cast abre um processo filho (`npx ...`), e se comunica com ele via stdin/stdout usando o protocolo MCP em JSON.

**http** (servers remotos):
```json
{
  "type": "http",
  "endpoint": "https://mcp.algum-servico.com/mcp"
}
```
O Cast faz requisições HTTP para o endpoint. Se o servidor retorna 401, executa o fluxo OAuth automaticamente.

**SSE** (Server-Sent Events):
Variante do HTTP onde o servidor pode enviar eventos de volta para o cliente.

### `CastOAuthProvider`

Implementa a interface `OAuthClientProvider` do SDK do MCP para servidores HTTP que exigem autenticação OAuth 2.0 + PKCE.

**Fluxo OAuth que o Cast implementa:**

```
1. Usuário adiciona um servidor HTTP que precisa de auth
2. Cast tenta uma requisição normal → servidor retorna 401
3. Cast descobre o authorization server via /.well-known/oauth-authorization-server
4. Registra o Cast como client OAuth via Dynamic Client Registration (RFC 7591)
5. Salva client_id e client_secret em ~/.cast/mcp-auth/<server>/client.json
6. Abre o browser com a URL de autorização (xdg-open no Linux)
7. Sobe um servidor HTTP local na porta 18090 para capturar o callback
8. Usuário aprova no browser → browser redireciona para http://127.0.0.1:18090/callback?code=...
9. Cast troca o code por um access_token
10. Salva o token em ~/.cast/mcp-auth/<server>/tokens.json
11. Retry da requisição original com Bearer token
```

**Por que PKCE?** PKCE (Proof Key for Code Exchange) é uma extensão do OAuth que protege o fluxo de autorização mesmo sem client_secret, adequado para aplicações que não podem manter secrets seguros (como CLIs). O Cast gera um `code_verifier` aleatório, envia o hash (`code_challenge`) na URL de auth, e depois prova que tem o verifier original ao trocar o code pelo token.

### `mcp-templates.ts`

Catálogo de 30+ servidores MCP pré-configurados. Quando o usuário faz `/mcp add`, vê categorias e templates. Cada template tem:
- Nome e descrição
- Configuração padrão (comando, args, env)
- Lista de credenciais necessárias (com placeholder e se é obrigatório)

Categorias: Dev Tools, Design, Data, Search, Cloud, Productivity, Payments, Browser, Filesystem.

---

## 11. Project — entendendo o repositório do usuário

**Pasta:** `src/modules/project/`

**Analogia:** quando você contrata um dev novo, você dá para ele um tour pelo projeto — "aqui é o backend, aqui é o frontend, usamos React e TypeScript, a convenção de nome é assim...". O módulo Project faz esse tour automaticamente.

### `ProjectAnalyzerService`

Analisa o repositório do usuário e gera um arquivo `.cast/context.md` com:
- Linguagens e frameworks detectados
- Arquitetura (Layered, Clean, Hexagonal, Microservices, DDD...)
- Módulos e sua estrutura
- Dependências principais
- Convenções de código detectadas

Suporta: TypeScript, JavaScript, Python, Go, Rust, Java, PHP, Ruby, C#.

**Como detecta o projeto?** Lê `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` etc. para identificar a linguagem e dependências. Analisa a estrutura de pastas para identificar padrões de arquitetura.

### `ProjectContextService`

Guarda o contexto carregado em memória e o expõe como string formatada para ser incluída no system prompt do DeepAgent. Quando o DeepAgent responde, ele "sabe" que está num projeto React com TypeScript porque o contexto diz isso.

### `ProjectLoaderService`

Sobe a árvore de diretórios procurando por uma pasta `.cast/` — que é onde o projeto do usuário é configurado. Lê:
- `.cast/context.md` — contexto do projeto
- `.cast/mcp/*.json` — configurações de servidores MCP
- `.cast/agents/*.md` — agentes customizados do projeto
- `.cast/skills/*.md` — skills customizadas do projeto

**Por que subir a árvore de diretórios?** Porque o usuário pode estar em qualquer subpasta do projeto quando rodar `cast`. O Cast precisa encontrar a raiz do projeto independente de onde você estiver.

---

## 12. Git — operações de versionamento com IA

**Pasta:** `src/modules/git/`

**Analogia:** ter um colega que lê todas as suas mudanças de código, entende o que você fez, e escreve uma mensagem de commit clara para você — ou um PR description detalhado.

### `CommitGeneratorService`

Métodos principais:
- `getDiffInfo()` — executa `git diff --cached` (staged) e `git diff` (unstaged), retorna as mudanças
- `hasChanges()` — verifica se há algo para commitar
- `generateCommitMessage(diff)` — usa o modelo `cheap` (barato) para gerar uma mensagem de commit no formato conventional commits (`feat:`, `fix:`, `refactor:`...)
- `executeCommit(message)` — executa `git commit -m "..."`
- `executePush(branch)` — executa `git push`
- `splitCommits(diff)` — analisa o diff e sugere múltiplos commits granulares por domínio de mudança

**Por que o modelo `cheap`?** Gerar mensagem de commit é uma tarefa simples — não precisa do modelo mais poderoso. Usar um modelo barato reduz custo e é mais rápido.

### `PrGeneratorService`

Mais complexo que o commit generator:
- `detectPlatform()` — identifica se é GitHub, GitLab, Azure DevOps, ou Bitbucket (baseado na URL do remote)
- `detectDefaultBaseBranch()` — encontra `main`, `master`, ou `develop`
- `getCommitsNotInBase()` — lista commits que estão na branch atual mas não na base
- `generatePRDescription(commits, diff)` — usa LLM para gerar título e descrição detalhada
- `createPR()` — chama a CLI da plataforma (`gh pr create`, `glab mr create`, etc.)

### `CodeReviewService`

- `reviewDiff()` — revisa as mudanças staged/unstaged com o modelo `reviewer`
- `reviewFile(path)` — faz uma revisão detalhada de um arquivo específico
- `fixFile(path)` — sugere e aplica correções em um arquivo
- `indentAll()` — formata todos os arquivos do projeto

### `MonorepoDetectorService`

Detecta se o repositório é um monorepo (Turborepo, Nx, pnpm workspaces, Lerna). Se for, adapta os comandos git para funcionar no contexto correto.

### `ReleaseNotesService`

Dado um range de commits (ex: da tag anterior até HEAD), gera release notes estruturadas com categorias (Features, Bug Fixes, Breaking Changes...).

---

## 13. Tasks — planejamento e execução de tarefas

**Pasta:** `src/modules/tasks/`

**Analogia:** um quadro Kanban. Cada tarefa tem um status (pendente, em progresso, concluída) e dependências de outras tarefas.

Este módulo gerencia tarefas que o agente cria internamente quando executa um plano complexo.

### `TaskManagementService`

Armazena tarefas em memória:
- `createTask(subject, description, dependencies?)` — cria tarefa
- `updateTask(id, updates)` — atualiza status ou metadados
- `listPendingTasks()` — retorna tarefas prontas para executar (sem dependências pendentes)
- `createPlan(tasks[])` — cria um conjunto de tarefas relacionadas

Estrutura de uma tarefa:
```typescript
{
  id: string,
  subject: string,          // nome curto da tarefa
  description: string,      // o que precisa ser feito
  activeForm: string,       // forma contínua ("Criando...", "Testando...")
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  dependencies: string[],   // IDs de tarefas que precisam terminar antes
  metadata: object
}
```

### `PlanExecutorService`

Executa um plano criado pelo Plan Mode. Segue as dependências entre tarefas e as executa na ordem correta.

### `PlanPersistenceService`

Salva e carrega planos do disco, para que um plano não se perca se o Cast for fechado.

---

## 14. Memory — memória persistente por projeto

**Pasta:** `src/modules/memory/`

**Analogia:** um caderno que o Cast carrega consigo. A cada projeto, ele tem um caderno diferente. O que você ensina em um projeto fica anotado e disponível na próxima sessão.

### `MemoryService`

- Cada projeto tem um ID único (hash do caminho absoluto)
- Memórias ficam em `~/.cast/projects/<hash>/memory/`
- O arquivo `MEMORY.md` é incluído automaticamente no system prompt (truncado em 200 linhas)
- Arquivos de memória específicos podem ser criados para tópicos detalhados

Métodos:
- `initialize(projectPath)` — cria diretório de memória do projeto
- `getMemoryPrompt()` — carrega `MEMORY.md` e retorna como string para o system prompt
- `write(filename, content)` — salva um arquivo de memória
- `read(filename)` — lê um arquivo de memória

**Por que 200 linhas no MEMORY.md?** O system prompt tem limite de tokens. Um arquivo de memória infinito consumiria todo o espaço disponível para a conversa em si. 200 linhas é suficiente para informações-chave sem prejudicar a janela de contexto.

---

## 15. Mentions — injeção de contexto via @

**Pasta:** `src/modules/mentions/`

**Analogia:** quando você está conversando com alguém e diz "olha esse arquivo aqui" enquanto mostra o arquivo — é isso que as menções fazem. Em vez de copiar e colar o conteúdo, você escreve `@src/auth/login.ts` e o Cast busca e injeta o conteúdo automaticamente.

### `MentionsService`

Parseia a mensagem do usuário procurando por padrões `@`:

| Padrão | Resultado |
|---|---|
| `@src/file.ts` | Conteúdo do arquivo |
| `@src/components/` | Listagem do diretório |
| `@git:status` | Saída de `git status` |
| `@git:diff` | Saída de `git diff` |
| `@git:log` | Últimos commits |
| `@git:branch` | Branch atual |
| `@https://url.com` | Conteúdo da URL |

Métodos:
- `processMessage(message)` — parseia e resolve todas as menções
- `parseMentions(message)` — extrai as menções sem resolver
- `resolveMention(mention)` — busca o conteúdo real de cada menção
- `buildExpandedMessage(message, resolved)` — substitui `@...` pelo conteúdo real

Limites de segurança:
- Máximo 500 linhas por arquivo
- Máximo 100KB por arquivo
- Máximo 30 menções por mensagem

**Por que limites?** Sem limites, um usuário poderia mencionar um arquivo de 50MB e estouro a janela de contexto do LLM (e o orçamento de tokens).

O `SmartInput` usa o `MentionsService.parseMentions()` também para gerar sugestões de autocompletar ao digitar `@` — mostra os arquivos do projeto como opções.

---

## 16. Permissions — controle de comandos perigosos

**Pasta:** `src/modules/permissions/`

**Analogia:** um botão de confirmação antes de deletar algo importante. "Tem certeza que quer fazer `rm -rf /`?"

### `PermissionService`

Antes de executar qualquer comando via a ferramenta `shell`, o `ShellToolsService` consulta o `PermissionService`.

**Níveis de risco:**

| Nível | Exemplos | Ação |
|---|---|---|
| SAFE | `ls`, `cat`, `echo`, `git status` | Executa direto |
| CAUTIOUS | `rm`, `mv`, `chmod`, `npm install -g` | Pede confirmação |
| DANGEROUS | `rm -rf`, `dd`, `mkfs`, `curl \| bash` | Bloqueado por padrão |

Padrões perigosos detectados por regex:
- `rm -rf /` ou variantes
- `dd if=... of=/dev/...`
- `mkfs.` (formatar disco)
- `:(){ :|:& };:` (fork bomb)
- `curl ... | bash` ou `wget ... | sh` (execução de scripts remotos)
- `git push --force` para main/master

O usuário pode salvar uma regra ("sempre permitir `rm` neste projeto") para não ser perguntado repetidamente.

**Por que isso existe?** O agente pode gerar comandos errados. Sem proteção, um comando malformado poderia apagar arquivos importantes. A camada de permissões é a última linha de defesa.

---

## 17. Como os módulos se comunicam

No NestJS, módulos se comunicam exclusivamente via injeção de dependências. Nenhum módulo importa diretamente uma instância de outro — ele declara no construtor o que precisa:

```typescript
@Injectable()
export class DeepAgentService {
  constructor(
    private readonly configService: ConfigService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly projectContext: ProjectContextService,
    private readonly memory: MemoryService,
  ) {}
}
```

O NestJS cria as instâncias e as passa automaticamente.

**Mapa de dependências entre módulos:**

```
ReplModule
  imports: CoreModule, ConfigModule, CommonModule, GitModule,
           AgentsModule, SkillsModule, McpModule, ProjectModule,
           TasksModule, PermissionsModule, MemoryModule, MentionsModule

CoreModule
  imports: CommonModule, AgentsModule, SkillsModule, McpModule,
           ProjectModule, ToolsModule, MemoryModule

AgentsModule
  imports: CommonModule, SkillsModule, ToolsModule, McpModule

SkillsModule
  imports: CommonModule, ToolsModule

McpModule
  imports: CommonModule

ProjectModule
  imports: CommonModule

GitModule
  imports: CommonModule

ToolsModule
  imports: PermissionsModule, TasksModule, MemoryModule

TasksModule
  imports: CommonModule

MemoryModule → sem dependências internas

MentionsModule → sem dependências internas

PermissionsModule → sem dependências internas

CommonModule → sem dependências internas (base de tudo)
```

**Regra geral:** `CommonModule` é a base — não depende de ninguém. Módulos de domínio (`GitModule`, `McpModule`, `AgentsModule`) dependem do `CommonModule`. Módulos orquestradores (`CoreModule`, `ReplModule`) dependem de vários.

---

## 18. Fluxo completo de uma mensagem

Você digita: `"crie um botão de logout em @src/components/Header.tsx"`

```
1. SmartInput captura a linha e emite para ReplService.handleLine()

2. ReplService.handleLine()
   → Não começa com "/" → é uma mensagem
   → Chama handleMessage()

3. handleMessage()
   → Chama MentionsService.processMessage()
   → MentionsService encontra "@src/components/Header.tsx"
   → Lê o arquivo → insere o conteúdo no lugar da menção
   → Mensagem expandida: "crie um botão de logout em\n\n[conteúdo do arquivo]"

4. PlanModeService.shouldEnterPlanMode()
   → Analisa a mensagem
   → "criar um botão" não é complexo → retorna false
   → Não entra em plan mode

5. DeepAgentService.chat(expandedMessage, onToken)
   → Constrói system prompt: projeto, agentes, skills, MCP, memória
   → Envia para o LLM via deepagents SDK
   → LLM decide usar a ferramenta "read_file" para confirmar o conteúdo
   → LLM decide usar "edit_file" para adicionar o botão
   → LLM chama edit_file com old_string e new_string

6. edit_file(path, old, new)
   → FilesystemToolsService executa a edição
   → Retorna confirmação

7. LLM recebe a confirmação e gera a resposta final
   → "Botão de logout adicionado em Header.tsx..."

8. onToken callback é chamado a cada token gerado
   → ReplService escreve cada token no terminal em tempo real
```

---

## 19. Fluxo completo de um comando /commit

Você digita: `/commit`

```
1. SmartInput captura → ReplService.handleLine()

2. handleLine() detecta "/" → chama handleCommand("commit", [])

3. handleCommand() → GitCommandsService.cmdCommit(smartInput)

4. GitCommandsService.cmdCommit()
   → CommitGeneratorService.hasChanges() → verifica git status
   → CommitGeneratorService.getDiffInfo() → executa git diff --cached

5. Se não tem nada staged:
   → Pergunta se quer fazer git add -A
   → Se sim, executa

6. CommitGeneratorService.generateCommitMessage(diff)
   → MultiLlmService.createModel('cheap') → modelo barato
   → Envia diff para o LLM com prompt para gerar conventional commit
   → Retorna: "feat(auth): add logout button to Header component"

7. smartInput.askChoice()
   → Exibe a mensagem sugerida
   → Opções: Usar esta | Editar | Regenerar | Cancelar

8. Se "Usar esta":
   → CommitGeneratorService.executeCommit(message)
   → execSync("git commit -m '...'")
   → Exibe confirmação com hash do commit

9. Pergunta: "Fazer push também?"
   → Se sim: CommitGeneratorService.executePush()
```

---

## 20. Decisões de arquitetura e por que não seria diferente

### Por que NestJS e não Express puro ou sem framework?

O projeto tem ~15 módulos com dependências cruzadas. Sem um sistema de injeção de dependências, seria necessário gerenciar manualmente quem instancia quem e em qual ordem. Com NestJS, você declara dependências no construtor e o framework resolve. Isso também facilita testar (você pode injetar mocks).

### Por que LangChain e não chamar a API do LLM diretamente?

LangChain abstrai a diferença entre providers (OpenAI, Anthropic, Ollama...). Sem ele, seria necessário implementar a integração com cada provider separadamente. LangChain também fornece o padrão `StructuredTool` que padroniza como ferramentas são definidas e chamadas — tanto as built-in quanto as do MCP.

### Por que deepagents (e não LangGraph diretamente)?

`deepagents` é uma camada de abstração sobre LangGraph que simplifica a criação de agentes com sub-agentes. LangGraph puro exigiria definir grafos de estado manualmente — `deepagents` fornece `createDeepAgent()` que configura isso automaticamente para o padrão de "agente principal com especialistas delegados".

### Por que arquivos markdown para agentes e skills?

Alternativas seriam JSON, YAML, ou definição em TypeScript. Markdown foi escolhido porque:
1. O "corpo" do markdown (abaixo do frontmatter) é o system prompt do agente — texto longo, que fica legível em markdown
2. Qualquer pessoa pode criar um agente sem saber TypeScript
3. Arquivos `.md` podem ter comentários naturais e são fáceis de versionar

### Por que SmartInput em vez de readline ou inquirer?

`readline` não suporta sugestões visuais em tempo real. `inquirer` e `@inquirer/prompts` não permitem integrar um campo de texto livre com autocompletar personalizado. O `SmartInput` foi construído do zero em raw mode exatamente para ter controle total sobre o comportamento do input — autocomplete de `/` comandos e `@` menções ao mesmo tempo que o usuário digita.

### Por que ~/.cast/ e não .env ou arquivos locais?

Configurações de provider (API keys, modelo padrão) são globais — independentes de qual projeto você está. Se fossem por projeto, você precisaria reconfigurá-las em cada repositório. Guardar em `~/.cast/config.yaml` (home do usuário) significa configurar uma vez e usar em todos os projetos.

Configurações de projeto (agentes, skills, MCP, contexto) ficam em `.cast/` na raiz do repositório — essas sim são por projeto e podem ser versionadas com o código.

### Por que o MCP tenta conexão plain-HTTP antes de OAuth?

Porque a maioria dos servidores MCP não precisa de auth (stdio ou HTTP simples). Rodar o fluxo OAuth para todo servidor HTTP seria lento e confuso. O padrão correto é: tenta sem auth, se receber 401, aí executa OAuth. Isso segue a especificação MCP.

### Por que tokens OAuth ficam em ~/.cast/mcp-auth/ e não no sistema de keychain?

Portabilidade. O keychain do sistema (libsecret no Linux, Keychain no macOS) varia por plataforma e às vezes requer configuração adicional. Um arquivo JSON em `~/.cast/mcp-auth/` funciona em qualquer Linux/macOS sem dependências extras. A desvantagem é segurança reduzida — mas para uma CLI de desenvolvimento local, esse trade-off é aceitável.

---

*Documentação gerada para cast-code v1.0.2 — pedrocastanha*
