---
name: cast-code
objective: |
  Desenvolver e manter o projeto cast-code utilizando TypeScript com arquitetura Layered Architecture.
primary_language: typescript
languages:
  - TypeScript
architecture:
  pattern: Layered Architecture
  confidence: high
---

# Visão Geral

Projeto cast-code desenvolvido em TypeScript seguindo Layered Architecture com 2 módulo(s) organizado(s).

## Arquitetura

**Padrão:** Layered Architecture

**Confiança:** high

Separação em camadas: apresentação, negócio, dados

## Estrutura

### Pontos de Entrada
- `src/main.ts`

### Diretórios Principais
- `src/`

## Módulos

### modules

**Caminho:** `src/modules`

**Papel:** Funcionalidade específica do domínio

**Arquivos:** 145

**Arquivos-chave:**
- `tools/tools.module.ts`
- `tools/index.ts`
- `tools/CLAUDE.md`
- `tasks/tasks.module.ts`
- `tasks/index.ts`

---

### common

**Caminho:** `src/common`

**Papel:** Common - Código compartilhado

**Arquivos:** 12

**Arquivos-chave:**
- `index.ts`
- `common.module.ts`
- `types/markdown.types.ts`
- `types/index.ts`
- `services/multi-llm.service.ts`

---

## Dependências

### Externas Principais
- @inquirer/prompts
- @langchain/anthropic
- @langchain/core
- @langchain/google-genai
- @langchain/langgraph
- @langchain/ollama
- @langchain/openai
- @modelcontextprotocol/sdk
- @nestjs/common
- @nestjs/core
- @nestjs/platform-express
- @types/js-yaml
- chalk
- deepagents
- dotenv

## Convenções

- **Nomenclatura:** mixed
- **Testes:** Não detectado
- **Linting:** Sim

## Estatísticas

- **Total de arquivos:** 100
- **Arquivos de configuração:** 9
- **Módulos:** 2
