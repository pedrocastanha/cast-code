# cast-code — contexto do projeto

## O que é

Cast é uma CLI multi-agente para engenheiros. Ela lê o codebase local, delega tarefas para sub-agentes especialistas, escreve e edita arquivos, gera commits semânticos, cria PRs e se conecta a ferramentas externas via MCP — tudo pelo terminal com o comando `cast`.

Inspirado no Claude Code e OpenAI Codex. Feito em Node.js + TypeScript com NestJS, LangChain e LangGraph.

---

## Stack técnica

- **Runtime**: Node.js ≥ 20, TypeScript
- **Framework**: NestJS (injeção de dependência, modular)
- **Orquestração de agentes**: LangChain + LangGraph (multi-agente, streaming)
- **MCP**: `@modelcontextprotocol/sdk` (stdio + HTTP/SSE, OAuth 2.0 + PKCE)
- **Providers suportados**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama (modelos locais)
- **Config**: YAML em `~/.cast/config.yaml`

---

## Estrutura de módulos

```
src/modules/
  repl/        CLI interativa, parser de comandos, SmartInput, autocomplete
  core/        agente principal, system prompt, modo de plano, streaming
  agents/      sub-agentes especialistas (coder, architect, reviewer, etc.)
  skills/      carregamento e resolução de skills por tipo
  mcp/         cliente MCP, OAuth, registro de servidores (30+ templates)
  git/         commits, split-commit, PR, revisão, release
  project/     análise de projeto, geração de contexto (/init, /project-deep)
  tools/       filesystem, shell, busca, web fetch
  config/      providers, modelos por role, config YAML
  mentions/    injeção de contexto via @arquivo, @dir, @git:diff, @url
  stats/        rastreamento de tokens e custo por sessão
  platform/    (novo) integração com plataforma remota via API key
```

---

## Sistema de agentes

O cast tem 7 sub-agentes built-in, cada um com um role específico:

| Role | Responsabilidade |
|---|---|
| `coder` | implementação geral |
| `architect` | design de sistema, decisões de arquitetura |
| `reviewer` | code review, verificação de qualidade |
| `frontend` | UI/UX, componentes |
| `backend` | APIs, servidor |
| `devops` | infra, deployment |
| `tester` | geração de testes, QA |

O agente principal roteia tarefas automaticamente para o sub-agente certo com base no contexto da mensagem e no tipo de tarefa.

Cada role pode ter um modelo diferente configurado:

```yaml
models:
  default: claude-sonnet-4-6
  subAgent: claude-haiku-4-5
  coder: gpt-4.1
  architect: claude-opus-4-6
  cheap: ollama/llama3.1:8b
```

---

## Sistema de skills

Skills são arquivos markdown em `.cast/skills/{tipo}/SKILL.md`. Quando carregadas, são injetadas no contexto do agente principal como conhecimento especializado.

O cast resolve skills por tipo:

```
.cast/skills/
  code-review/SKILL.md
  commit-style/SKILL.md
  api-design/SKILL.md
```

Skills remotas (da plataforma) seguem o mesmo formato e são mescladas com as locais. Local tem prioridade em caso de conflito de nome.

---

## Comandos principais

### Core
- `/init` — analisa o projeto e gera contexto
- `/context` — mostra ferramentas, agentes, skills e MCP ativos
- `/stats` — uso de tokens e custo da sessão
- `/compact` — comprime o contexto para economizar tokens
- `/kanban` — quadro Kanban em localhost:3333

### Git
- `/up` — mensagem de commit gerada por IA + push
- `/split-up` — divide mudanças em commits lógicos
- `/pr` — gera título e descrição de PR
- `/review [arquivos]` — revisão por IA
- `/unit-test` — gera testes para as mudanças da branch

### Agentes e skills
- `/agents` — lista sub-agentes disponíveis
- `/agents create` — cria agent customizado
- `/skills` — lista skills carregadas
- `/skills create` — cria nova skill

### Plataforma (novo módulo)
- `cast platform --project <id>` — vincula diretório a projeto da plataforma
- `/bench run` — executa benchmark tasks (plano pro+)

---

## Injeção de contexto via @mention

```
@src/auth/service.ts     → injeta conteúdo do arquivo
@src/components/         → injeta listagem do diretório
@git:diff                → injeta diff atual
@git:status              → injeta git status
@https://docs.example.com → busca e injeta URL
```

---

## Arquivo de configuração

```yaml
# ~/.cast/config.yaml
provider: anthropic
models:
  default: claude-sonnet-4-6
  subAgent: claude-haiku-4-5
  cheap: ollama/llama3.1:8b

# configuração por projeto (opcional)
# .cast/platform.yaml
projectId: "uuid"
apiKeyEnv: "CAST_API_KEY"
apiUrl: "https://api.castplatform.dev"
```

---

## Convenções do codebase

- Todo módulo NestJS tem `*.module.ts`, `*.service.ts` e eventualmente `*.controller.ts`
- Streaming de outputs via LangGraph usa `StreamingCallbackHandler`
- Ferramentas de filesystem e shell ficam em `src/modules/tools/`
- Comandos REPL são registrados em `src/modules/repl/commands/`
- MCP servers são registrados em `src/modules/mcp/servers/` como templates YAML

---

## Pontos de atenção ao modificar o cast

1. **Não bloquear o REPL**: operações assíncronas (fetch de API, análise de projeto) devem rodar em background ou com timeout. O REPL precisa responder imediatamente.
2. **Respeitar o modo offline**: se qualquer serviço externo (API da plataforma, MCP server) falhar, o cast continua funcionando com o que tem localmente.
3. **Cache de configs**: configs remotas ficam em `.cast/platform.cache.json`. TTL de 5 minutos em memória, 24h em disco.
4. **Não logar conteúdo de prompts**: a telemetria envia apenas metadados (tipo de evento, tokens, custo, role do agente). Nunca o conteúdo das mensagens.
5. **Prioridade local**: skills e agents locais sempre vencem os remotos em caso de nome duplicado.
