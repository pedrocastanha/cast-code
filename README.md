# Cast Code

Uma CLI de codificação com IA, inspirada no Claude Code. Rode `cast` no seu terminal e tenha um assistente de código que lê, escreve, executa comandos e busca na web — tudo em uma conversa contínua.

![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## O que é

Cast Code é uma ferramenta de linha de comando que coloca uma IA no seu terminal. Você descreve o que quer fazer em português (ou inglês) e ela executa: edita arquivos, roda testes, explica código, refatora, cria componentes, o que precisar.

A diferença de só usar ChatGPT? Aqui a IA tem acesso ao seu projeto. Ela pode listar arquivos, ler o código, fazer buscas, executar comandos — e fica tudo no contexto da conversa.

### Exemplos do que dá pra fazer

```bash
# Explicar um arquivo confuso
> como funciona esse auth.middleware.ts?

# Criar algo novo
> cria um componente de modal usando React e Tailwind

# Refatorar em lote
> renomeia todas as funções de handleClick para onClick

# Debugar
> tá dando erro no npm test, investiga pra mim

# Delegar pra um especialista
> @architect como eu deveria estruturar esse módulo?
```

---

## Instalação

```bash
npm install -g cast-code
```

Precisa do Node.js 20+.

---

## Primeiros passos

### 1. Configuração Inicial

Na primeira execução, o Cast irá guiar você através de uma configuração interativa:

```bash
cast
# ou
cast config init
```

Você poderá configurar:
- **Múltiplos provedores de IA** (OpenAI, Anthropic, Google Gemini, Kimi, DeepSeek, OpenRouter, Ollama)
- **Modelos por finalidade**: modelo principal, sub-agentes, coder, architect, reviewer, etc.

### 2. Rode em qualquer projeto

```bash
cd seu-projeto
cast
```

### 3. Comece a conversar

Digite o que você quer fazer e aperte Enter.

---

## Configuração de Provedores

Cast suporta múltiplos provedores de IA. Você pode configurar quantos quiser e usar modelos diferentes para diferentes tarefas.

### Provedores Suportados

| Provedor | Descrição | Modelos Populares |
|----------|-----------|-------------------|
| **OpenAI** | GPT-4, GPT-4o, etc. | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| **Anthropic** | Claude 3.5 Sonnet, Opus | `claude-3-5-sonnet-20241022`, `claude-3-opus` |
| **Google Gemini** | Via Google AI Studio | `gemini-1.5-pro`, `gemini-1.5-flash` |
| **Moonshot Kimi** | Modelos chineses avançados | `kimi-k2`, `kimi-k1.5` |
| **DeepSeek** | Chat e Coder | `deepseek-chat`, `deepseek-coder` |
| **OpenRouter** | Acesso a múltiplos modelos | `anthropic/claude-3.5-sonnet`, `openai/gpt-4o` |
| **Ollama** | Modelos locais | `llama3.2`, `codellama`, `mistral` |

### Configuração Manual (YAML)

O arquivo de configuração fica em `~/.cast/config.yaml`:

```yaml
version: 1
providers:
  openai:
    apiKey: sk-sua-chave-aqui
  anthropic:
    apiKey: sk-ant-sua-chave-aqui
  ollama:
    baseUrl: http://localhost:11434

models:
  default:
    provider: openai
    model: gpt-4o
    temperature: 0.1
  
  subAgent:
    provider: openai
    model: gpt-4o-mini
    temperature: 0.1
  
  coder:
    provider: anthropic
    model: claude-3-5-sonnet-20241022
    temperature: 0.1
  
  architect:
    provider: openai
    model: o1-preview
    temperature: 0.1
```

### Finalidades de Modelos

Você pode configurar modelos específicos para cada tipo de tarefa:

| Finalidade | Uso Recomendado |
|------------|-----------------|
| `default` | Modelo principal para conversas gerais |
| `subAgent` | Modelos mais baratos para tarefas paralelas |
| `coder` | Modelo especializado em código |
| `architect` | Modelo para design de sistemas |
| `reviewer` | Modelo para revisão de código |
| `planner` | Modelo para planejamento de tarefas |
| `cheap` | Modelo econômico para tarefas simples |

---

## Comandos da CLI

Durante a conversa, você pode usar:

| Comando | O que faz |
|---------|-----------|
| `/help` | Mostra todos os comandos |
| `/clear` | Limpa o histórico da conversa |
| `/exit` | Sai do Cast |
| `/commit` | Gera um commit com as alterações |
| `/diff` | Mostra o diff do git |
| `/review` | Pede uma revisão de código |
| `/agents` | Lista os agentes especializados |
| `/tools` | Lista as ferramentas disponíveis |
| `/context` | Mostra o contexto atual do projeto |
| `/config` | Menu de configurações interativo |
| `/project` | Analisa e gera contexto do projeto |
| `/mcp` | Hub de servidores MCP |

### Comando `/config`

Acesse o menu de configurações interativo:

```bash
/config           # Menu completo
/config init      # Configuração inicial
/config show      # Ver configuração atual
/config add-provider     # Adicionar provedor
/config remove-provider  # Remover provedor
/config set-model        # Configurar modelo
/config path             # Caminho do arquivo
```

**Recursos:**
- Configure múltiplos provedores simultaneamente
- Escolha modelos populares ou digite um customizado
- Defina modelos específicos para cada finalidade (default, coder, subAgent, etc.)

### Comando `/mcp` - Model Context Protocol

O Cast suporta **MCP (Model Context Protocol)** - um protocolo aberto que permite conectar ferramentas externas à IA.

```bash
/mcp           # Menu do MCP Hub
/mcp list      # Ver servidores configurados
/mcp tools     # Ver ferramentas disponíveis
/mcp add       # Adicionar servidor MCP
/mcp remove    # Remover servidor MCP
/mcp what      # O que é MCP?
/mcp help      # Guia completo
```

#### O que é MCP?

MCP (Model Context Protocol) é um protocolo aberto da Anthropic que permite que assistentes de IA se conectem a:
- **APIs externas** (GitHub, Slack, etc.)
- **Bancos de dados** (PostgreSQL, MongoDB, etc.)
- **Ferramentas locais** (sistema de arquivos, navegador, etc.)
- **Serviços web** (busca, APIs REST, etc.)

**Vantagens:**
- 🔒 Seguro: você controla o acesso
- 🔌 Padrão aberto: não é vendor lock-in
- 🛠️ Extensível: qualquer linguagem/framework

#### Servidores MCP Populares

| Servidor | Descrição | Comando |
|----------|-----------|---------|
| **GitHub** | Acesse repos, issues, PRs | `@modelcontextprotocol/server-github` |
| **Figma** | Acesse designs (OAuth) | `@figma/mcp-server` (HTTP) |
| **Filesystem** | Leia/escreva arquivos | `@modelcontextprotocol/server-filesystem` |
| **PostgreSQL** | Consulte bancos de dados | `@modelcontextprotocol/server-postgres` |
| **Brave Search** | Busca na web | `@modelcontextprotocol/server-brave-search` |
| **Puppeteer** | Automação de browser | `@modelcontextprotocol/server-puppeteer` |

**Exemplo de uso com GitHub:**
```bash
# Adicione o servidor
/mcp add
# Escolha "GitHub" e informe seu token

# Agora a IA pode:
> Crie uma issue no repo atual sobre o bug de autenticação
> Liste os PRs abertos e resuma as mudanças
> Faça um commit com a mensagem "Fix: corrige bug no login"
```

**Exemplo de uso com Figma:**
```bash
# Adicione o servidor (usa autenticação OAuth)
/mcp add
# Escolha "Figma" - é um servidor HTTP remoto

# Após reiniciar, autentique quando solicitado:
# O navegador abrirá para você fazer login no Figma e autorizar

# Agora a IA pode:
> Analise o design do arquivo XYZ e sugira como implementar o componente Header
> Extraia os tokens de cor e tipografia do arquivo de Design System
> Compare o código atual com o design no Figma e identifique diferenças
```

**Nota sobre OAuth:** O Figma MCP é um servidor remoto oficial que requer autenticação OAuth. Quando você adiciona e reinicia o Cast, o sistema solicitará que você faça login no Figma e autorize o acesso. Isso é mais seguro que tokens de API, pois você tem controle total sobre as permissões e pode revogar a qualquer momento.

---

### Comando `/project` - Contexto do Projeto

O Cast pode analisar automaticamente seu projeto e gerar um arquivo de contexto que será usado em todas as conversas.

```bash
/project              # Analisa e gera/atualiza o contexto
/project-deep         # Análise profunda (gera instruções para agente)
/project analyze      # Gera .cast/context.md automaticamente
/project show         # Mostra o contexto atual
/project edit         # Abre no editor para edição
/project help         # Ajuda do comando
```

**O que é detectado:**
- Stack tecnológica (Node.js, Python, Go, etc.)
- Frameworks (NestJS, Next.js, React, etc.)
- Estrutura de módulos e arquivos principais
- Dependências do projeto
- Convenções e configurações

**Exemplo Rápido:**
```bash
> /project
🔍 Analisando projeto...
✓ Stack detectada: Node.js, TypeScript, NestJS, LangChain
✓ 3 módulo(s) encontrado(s)
✓ 15 dependência(s)
✓ Contexto gerado: /home/user/project/.cast/context.md
```

**Exemplo Profundo:**
```bash
> /project-deep
🔍 Analisando projeto...
✓ Linguagem principal: TypeScript
✓ Arquitetura detectada: Layered Architecture (high)
✓ 5 módulo(s) encontrado(s)
✓ 100 arquivo(s) de código
✓ Contexto básico gerado
✓ Instruções para agente geradas
```

O arquivo `.cast/context.md` é carregado automaticamente pelo Cast em todas as conversas, fornecendo contexto rico sobre:

**O que é detectado:**
- **Objetivo do projeto** - Descrição clara do propósito
- **Stack completa** - Tecnologias, frameworks, bibliotecas
- **Arquitetura** - Padrão arquitetural (MVC, Modular, DDD, etc.)
- **Módulos detalhados**:
  - Nome e descrição
  - Responsabilidades específicas
  - Padrões utilizados (Service, Repository, Controller, etc.)
  - Exports principais (classes, funções)
  - Dependências externas
  - Arquivos principais com descrições
- **Padrões de projeto** - Arquiteturais, estruturais, nomenclatura
- **Convenções** - Código, Git, testes
- **Dependências** - Produção e desenvolvimento
- **Pontos de entrada** - Arquivos main/index
- **Configurações** - Arquivos de config do projeto

#### Criando seu próprio MCP

Quer criar uma integração customizada? É mais fácil do que parece!

**TypeScript/JavaScript:**
```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'meu-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Defina suas ferramentas
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'buscar_cliente',
    description: 'Busca cliente pelo ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  }]
}));

// Implemente a lógica
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { id } = req.params.arguments;
  const cliente = await db.findById(id);
  return { 
    content: [{ type: 'text', text: JSON.stringify(cliente) }] 
  };
});

// Inicie
const transport = new StdioServerTransport();
await server.connect(transport);
```

Publique no npm e qualquer pessoa poderá usar:
```bash
npx -y seu-mcp-server
```

**Recursos:**
- 📚 Documentação: https://modelcontextprotocol.io
- 💻 SDK TypeScript: `@modelcontextprotocol/sdk`
- 🔗 Exemplos: github.com/modelcontextprotocol/servers

---

## Agentes Especializados

Às vezes você quer que um especialista cuide de algo específico. Cast tem 7 agentes internos:

| Agente | Quando chamar |
|--------|---------------|
| `coder` | Codificação geral, ajustes rápidos |
| `architect` | Design de sistemas, decisões de arquitetura |
| `frontend` | UI/UX, React, CSS, componentes |
| `backend` | APIs, banco de dados, lógica de negócio |
| `tester` | Escrever e revisar testes |
| `reviewer` | Revisar código existente |
| `devops` | CI/CD, Docker, infraestrutura |

Para chamar um agente específico:

```bash
> @architect me ajuda a modelar esse domínio
> @frontend cria um formulário de login responsivo
> @backend implementa uma rota de autenticação JWT
```

---

## Menções úteis

Na hora de escrever prompts, você pode usar alguns atalhos:

| Menção | O que faz |
|--------|-----------|
| `@` | Referencia arquivos do projeto (com autocomplete) |
| `@git:status` | Inclui o status do git na conversa |
| `@git:diff` | Inclui o diff atual |
| `@git:log` | Inclui os últimos commits |

Exemplo:

```bash
> revisa o @src/utils/helpers.ts e sugere melhorias
> com base no @git:diff, gera uma mensagem de commit
```

---

## Configuração por projeto

Se quiser, pode criar uma pasta `.cast/` na raiz do seu projeto com configurações específicas:

```
.cast/
├── context.md       # Contexto e convenções do projeto
├── config.md        # Configurações específicas
└── agents/          # Agentes customizados
```

Exemplo de `context.md`:

```markdown
---
name: meu-projeto
stack:
  - typescript
  - react
  - tailwind
conventions:
  - camelCase para variáveis
  - PascalCase para componentes
---

## Estrutura
- src/components - Componentes React
- src/pages - Páginas
- src/lib - Funções utilitárias
```

---

## Ferramentas disponíveis

A IA tem acesso a essas ferramentas nativamente:

- **Arquivos:** ler, escrever, editar, listar diretórios
- **Busca:** grep, glob patterns
- **Shell:** executar comandos no terminal
- **Web:** buscar na internet, baixar páginas
- **Git:** status, diff, log (via menções)

---

## Modelos Locais (Ollama)

Para usar modelos locais via Ollama:

1. Instale o Ollama: https://ollama.com
2. Baixe um modelo: `ollama pull llama3.2`
3. Configure no Cast:
   ```bash
   cast config init
   # Selecione "Ollama (Local)" como provedor
   ```

Exemplo de configuração YAML:

```yaml
providers:
  ollama:
    baseUrl: http://localhost:11434

models:
  default:
    provider: ollama
    model: llama3.2
    temperature: 0.1
```

---

## Motivação

Esse projeto nasceu de uma frustração: queria usar algo como o Claude Code, mas com mais controle sobre o modelo, agentes customizados e integração com meu próprio workflow de git.

A ideia é simples: uma conversa contínua com uma IA que entende seu projeto e pode agir sobre ele — sem sair do terminal.

---

## Licença

MIT — use, modifique, distribua como quiser.

---

**Autor:** Pedro Castanheira
