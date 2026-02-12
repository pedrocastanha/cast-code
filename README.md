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

1. **Configure sua API key:**

```bash
export OPENAI_API_KEY=sk-sua-chave-aqui
```

Ou crie um arquivo `~/.cast/config.md`:

```markdown
---
model: gpt-4.1-nano
temperature: 0.1
apiKey: sk-sua-chave-aqui
---
```

2. **Rode em qualquer projeto:**

```bash
cd seu-projeto
cast
```

3. **Comece a conversar.** Digite o que você quer fazer e aperta Enter.

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

## Modelos suportados

Funciona com qualquer modelo compatível com OpenAI, incluindo:

- GPT-4.1 e família
- GPT-4o
- Modelos via Ollama (rodando local)

Para usar Ollama, configure no `~/.cast/config.md`:

```markdown
---
provider: ollama
model: llama3.2
baseUrl: http://localhost:11434
---
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
