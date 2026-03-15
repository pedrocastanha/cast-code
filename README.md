# Cast Code

> Uma CLI multi-agente que pensa, planeja e escreve código junto com você — direto no seu terminal.

Cast é um assistente autônomo de IA para engenheiros. Ele lê o codebase, delega para sub-agentes especialistas, escreve e edita arquivos, gera commits, cria PRs e se conecta a ferramentas externas via MCP — tudo com um único comando `cast`.

Feito por [pedrocastanha](https://github.com/pedrocastanha). Inspirado no Claude Code, OpenAI Codex e Kimi.

---

## Instalação

```bash
npm install -g cast-code
cast
```

> Requer Node.js ≥ 20. Funciona no Linux e macOS (bash, zsh, fish e qualquer shell POSIX).

<details>
<summary><strong>cast não encontrado após instalar?</strong></summary>

O diretório global de binários do npm pode não estar no seu `PATH`. Descubra com `npm prefix -g` e adicione `<prefix>/bin` ao seu shell:

| Shell | Arquivo | Linha |
|---|---|---|
| bash | `~/.bashrc` ou `~/.bash_profile` | `export PATH="$(npm prefix -g)/bin:$PATH"` |
| zsh | `~/.zshrc` | `export PATH="$(npm prefix -g)/bin:$PATH"` |
| fish | `~/.config/fish/config.fish` | `fish_add_path (npm prefix -g)/bin` |

Recarregue o shell e rode `cast`.
</details>

---

## O que o Cast faz

| Capacidade | Como |
|---|---|
| Explorar e entender o codebase | Lê arquivos, busca padrões, mapeia a estrutura |
| Escrever, editar e refatorar código | Ciclo completo: leitura → plano → escrita → verificação |
| Gerar commits semânticos | `/up` — IA lê o diff e escreve a mensagem |
| Dividir commits inteligentemente | `/split-up` — agrupa mudanças por intenção lógica |
| Criar descrições de pull request | `/pr` — gera corpo de PR com contexto rico |
| Revisar código | `/review [arquivos]` — aponta problemas com contexto |
| Delegar para agentes especialistas | `coder`, `architect`, `reviewer`, `frontend`, `backend`, `devops`, `tester` |
| Conectar a 30+ ferramentas externas | MCP — Figma, GitHub, bancos de dados, browser e mais |
| Trabalhar pelo celular | `/remote` — interface web segura via ngrok com entrada por voz |

---

## Providers

O Cast funciona com qualquer um destes:

| Provider | Variável de ambiente |
|---|---|
| OpenAI (GPT-4.1, o3…) | `OPENAI_API_KEY` |
| Anthropic (Claude 4) | `ANTHROPIC_API_KEY` |
| Google (Gemini 2.5) | `GOOGLE_API_KEY` |
| Ollama (modelos locais) | *(sem chave)* |

Você pode atribuir modelos diferentes por papel — `default`, `subAgent`, `coder`, `architect`, `reviewer`, `planner`, `cheap` — para equilibrar custo e qualidade por tarefa.

Configure com `/config init` ou edite `~/.cast/config.yaml` diretamente.

---

## Comandos

### Core
| Comando | O que faz |
|---|---|
| `/help` | Mostra todos os comandos |
| `/init` | Analisa o projeto e gera contexto |
| `/project-deep` | Contexto profundo + briefing para agente especialista |
| `/context` | Sessão atual: ferramentas, agentes, skills, MCP |
| `/clear` | Limpa o histórico da conversa |
| `/compact` | Comprime o contexto para economizar tokens |
| `/stats` | Uso de tokens e custo da sessão |
| `/kanban` | Abre o quadro Kanban (localhost:3333) |
| `/remote` | Expõe interface web via ngrok |
| `/exit` | Sair |

### Git
| Comando | O que faz |
|---|---|
| `/status`, `/diff`, `/log` | Status, diff, log do git |
| `/up` | Mensagem de commit gerada por IA → confirmar → push |
| `/split-up` | Divide mudanças em commits lógicos |
| `/pr` | Gera título + descrição de PR |
| `/review [arquivos]` | Revisão de código por IA |
| `/fix <arquivo>` | Corrige problemas automaticamente em um arquivo |
| `/release [tag]` | Gera notas de release |
| `/unit-test` | Gera testes para as mudanças da branch |

### Agentes & Skills
| Comando | O que faz |
|---|---|
| `/agents` | Lista todos os agentes especialistas |
| `/agents create` | Cria um agente customizado |
| `/skills` | Lista todas as skills |
| `/skills create` | Cria uma skill customizada |

### Config & MCP
| Comando | O que faz |
|---|---|
| `/config` | Menu de configuração |
| `/mcp list` | Lista os servidores MCP configurados |
| `/mcp add` | Adiciona um servidor (30+ templates ou customizado) |

---

## Injeção de contexto com `@`

Mencione qualquer arquivo, diretório ou fonte de dados para injetá-lo direto no seu prompt:

```
@src/auth/service.ts           → injeta o conteúdo do arquivo
@src/components/               → injeta a listagem do diretório
@git:status                    → injeta o git status atual
@git:diff                      → injeta o diff atual
@https://docs.example.com      → busca e injeta a URL
```

---

## Sistema multi-agente

O Cast vem com 7 agentes especialistas built-in:

- **coder** — implementação de propósito geral
- **architect** — design de sistema e decisões de arquitetura
- **reviewer** — revisão de código e verificação de qualidade
- **frontend** — implementação de UI/UX
- **backend** — trabalho em APIs e lado do servidor
- **devops** — infraestrutura e deployment
- **tester** — geração de testes e garantia de qualidade

O Cast roteia as tarefas para o agente certo automaticamente, ou você pode endereçá-los diretamente. Adicione seus próprios agentes em `.cast/agents/` em qualquer projeto.

---

## MCP — Model Context Protocol

O Cast integra com 30+ ferramentas externas via MCP em diversas categorias:

**Dev Tools** · GitHub · GitLab · Jira · Linear
**Design** · Figma Desktop · Storybook
**Dados** · PostgreSQL · MySQL · SQLite · Redis
**Busca** · Brave · Perplexity · Exa
**Cloud** · AWS · Vercel · Cloudflare
**Produtividade** · Slack · Notion · Google Drive
**Browser** · Playwright · Puppeteer

### Figma Desktop (recomendado para frontend)

1. Instale o [Figma Desktop](https://www.figma.com/downloads/) e abra um arquivo em Dev Mode
2. No painel Inspect → ative **"Enable desktop MCP server"**
3. No Cast: `/mcp add` → Design → Figma Desktop
4. Reinicie o Cast — agora você pode pedir ao Cast para implementar componentes direto dos seus designs no Figma

Para servidores HTTP que exigem OAuth, o Cast gerencia o fluxo completo de OAuth 2.0 + PKCE automaticamente.

---

## Acesso remoto

O Cast pode servir uma interface web protegida por senha — acessível pelo celular, tablet ou qualquer máquina remota.

```bash
/remote
```

```
🌐 Remote Access Online!
Link:     https://xxxx.ngrok-free.app
Password: sua-senha
```

Suporta streaming de saída em tempo real, envio de prompts pelo browser e **entrada por voz** via Whisper.

---

## Modo de planejamento

Para tarefas complexas o Cast entra em modo de planejamento — faz perguntas de esclarecimento, propõe um plano estruturado e só executa após sua aprovação. Você pode refinar, rejeitar ou simplesmente dizer "vai" para prosseguir sem plano.

---

## Stack técnica

- **Runtime**: Node.js ≥ 20, TypeScript
- **Framework**: NestJS (DI, modular)
- **Orquestração**: LangChain + LangGraph (multi-agente, streaming)
- **MCP**: `@modelcontextprotocol/sdk` (stdio + HTTP/SSE, OAuth 2.0 + PKCE)
- **Providers**: Anthropic, OpenAI, Google Gemini, Ollama
- **Config**: YAML em `~/.cast/config.yaml`

### Estrutura dos módulos

```
src/modules/
  repl/        CLI interativa, comandos, SmartInput, autocomplete
  core/        agente principal, system prompt, modo de plano, streaming
  agents/      sub-agentes especialistas
  skills/      definições de skills e carregamento de conhecimento
  mcp/         cliente MCP, OAuth, registro de servidores, 30+ templates
  git/         geração de commits, split-commit, PR, revisão, release
  project/     análise de projeto e geração de contexto
  tools/       ferramentas de filesystem, shell, busca, web
  config/      configuração de providers e modelos
  mentions/    injeção de contexto via @-mention
  stats/       rastreamento de tokens e custo da sessão
```

---

## Desenvolvimento local

```bash
npm install
npm run build
npm run start       # executa uma vez
npm run start:dev   # modo watch (recompila ao salvar)
```

---

## Dicas

- Rode `/init` ao começar em um novo projeto — ele mapeia o codebase para o contexto
- Mantenha `.cast/context.md` atualizado com notas específicas do projeto
- Use `/compact` quando a sessão ficar longa para evitar atingir os limites de tokens
- Rode `/context` para verificar o que o Cast está vendo no momento
- Agentes e skills no nível do projeto ficam em `.cast/agents/` e `.cast/skills/`
