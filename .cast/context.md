---
name: kimi-code
objective: |
  Desenvolver e manter o projeto kimi-code utilizando TypeScript com arquitetura Layered Architecture.
primary_language: typescript
languages:
  - TypeScript
architecture:
  pattern: Layered Architecture
  confidence: high
---

# Visão Geral

Projeto kimi-code desenvolvido em TypeScript seguindo Layered Architecture com 2 módulo(s) organizado(s).

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

**Arquivos:** 126

**Arquivos-chave:**
- `claude.md`
- `tools/tools.module.ts`
- `tools/index.ts`
- `tools/claude.md`
- `skills/skills.module.ts`

---

### common

**Caminho:** `src/common`

**Papel:** Common - Código compartilhado

**Arquivos:** 11

**Arquivos-chave:**
- `index.ts`
- `common.module.ts`
- `claude.md`
- `types/markdown.types.ts`
- `types/index.ts`

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
