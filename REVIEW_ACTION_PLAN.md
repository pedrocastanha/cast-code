# Plano de Acao da Revisao Tecnica

Baseado em:
- leitura estrutural do projeto
- execucao real da CLI
- analise estatica dos modulos
- revisao cruzada com `kimi`

## Ordem Recomendada

1. Qualidade de build e type-safety
2. Unificacao de configuracao e DI
3. Correcao de UX/logs da CLI
4. Contratos/DTOs e validacao
5. Skills/subagentes e modularizacao
6. Personalizacao e limpeza de codigo morto

---

## 1. Pipeline de qualidade quebrado

### Problema

O projeto compila sem type-check real e o lint nao roda.

### Evidencia do problema

- [nest-cli.json:8](./nest-cli.json) desliga `typeCheck`
- [package.json:17](./package.json) e [package.json:18](./package.json) expoem scripts de lint
- [.eslintrc.json:7](./.eslintrc.json) exige `@typescript-eslint`
- o pacote necessario nao esta em `devDependencies`

### Local do problema

- [nest-cli.json](./nest-cli.json)
- [package.json](./package.json)
- [.eslintrc.json](./.eslintrc.json)

### Como reproduzir esse problema

1. Rodar `npm run build`
2. Rodar `npm run lint:check`

### Resultado atual

- `build` passa
- `lint:check` quebra antes de revisar o codigo

### Solucao esperada pra ele

O build deve falhar quando houver erro de tipo e o lint deve rodar com sucesso.

### Ideias de como arrumar o problema

- habilitar type-check no build ou criar `npm run typecheck`
- instalar `@typescript-eslint/parser` e `@typescript-eslint/eslint-plugin`
- colocar `build`, `typecheck` e `lint:check` no fluxo obrigatorio de CI

---

## 2. Contrato de `SmartInput` incorreto e erro escondido pelo build

### Problema

O tipo declarado nao corresponde ao uso real.

### Evidencia do problema

- [src/modules/repl/services/commands/project-commands.service.ts:8](./src/modules/repl/services/commands/project-commands.service.ts) define `SmartInput` sem `pause`/`resume`
- [src/modules/repl/services/commands/project-commands.service.ts:48](./src/modules/repl/services/commands/project-commands.service.ts) usa `pause()`
- [src/modules/repl/services/commands/project-commands.service.ts:120](./src/modules/repl/services/commands/project-commands.service.ts) usa `resume()`

### Local do problema

- [src/modules/repl/services/commands/project-commands.service.ts](./src/modules/repl/services/commands/project-commands.service.ts)

### Como reproduzir esse problema

1. Habilitar type-check no projeto
2. Rodar `tsc` com verificacao completa

### Resultado atual

O problema fica escondido porque o pipeline principal nao esta validando tipos de forma efetiva.

### Solucao esperada pra ele

A interface consumida pelos command handlers deve ser exatamente a interface implementada pelo `SmartInput`.

### Ideias de como arrumar o problema

- exportar uma interface unica do `SmartInput`
- parar de duplicar contratos locais
- usar o tipo real em todos os handlers

---

## 3. Configuracao duplicada e estado inconsistente de provider/model

### Problema

Ha dois sistemas de configuracao coexistindo e `ConfigService` ainda e registrado duas vezes.

### Evidencia do problema

- [src/common/common.module.ts:12](./src/common/common.module.ts) registra `ConfigService`
- [src/modules/core/core.module.ts:16](./src/modules/core/core.module.ts) registra `ConfigService` de novo
- [src/common/services/config.service.ts:23](./src/common/services/config.service.ts) mantem estado proprio
- [src/modules/config/services/config-manager.service.ts:30](./src/modules/config/services/config-manager.service.ts) mantem outro estado
- na execucao real, o banner mostrou um modelo e `/context` mostrou outro

### Local do problema

- [src/common/services/config.service.ts](./src/common/services/config.service.ts)
- [src/modules/config/services/config-manager.service.ts](./src/modules/config/services/config-manager.service.ts)
- [src/modules/repl/services/repl.service.ts:56](./src/modules/repl/services/repl.service.ts)
- [src/modules/repl/services/commands/repl-commands.service.ts:118](./src/modules/repl/services/commands/repl-commands.service.ts)

### Como reproduzir esse problema

1. Abrir a CLI
2. Comparar o banner inicial com `/context`
3. Comparar com `/model`

### Resultado atual

Os valores de provider/model podem divergir visualmente e semanticamente.

### Solucao esperada pra ele

Uma unica fonte de verdade para configuracao de provider/model em toda a aplicacao.

### Ideias de como arrumar o problema

- remover `ConfigService` legado
- usar apenas `ConfigManagerService`
- eliminar o provider duplicado no `CoreModule`
- migrar todos os consumidores para o config novo

---

## 4. Status de memoria quebrado no `/context`

### Problema

O comando consulta um campo privado inexistente.

### Evidencia do problema

- [src/modules/repl/services/commands/repl-commands.service.ts:162](./src/modules/repl/services/commands/repl-commands.service.ts) usa `this.memoryService['memoryPath']`
- o servico real expoe [src/modules/memory/services/memory.service.ts:123](./src/modules/memory/services/memory.service.ts) e [src/modules/memory/services/memory.service.ts:127](./src/modules/memory/services/memory.service.ts)

### Local do problema

- [src/modules/repl/services/commands/repl-commands.service.ts](./src/modules/repl/services/commands/repl-commands.service.ts)
- [src/modules/memory/services/memory.service.ts](./src/modules/memory/services/memory.service.ts)

### Como reproduzir esse problema

1. Abrir a CLI
2. Rodar `/context`

### Resultado atual

A linha de memoria some ou aparece de forma inconsistente.

### Solucao esperada pra ele

`/context` deve sempre mostrar `Memory: enabled` ou `Memory: not configured`.

### Ideias de como arrumar o problema

- usar `memoryService.isInitialized()`
- expor getter publico sem reflection por string
- remover `try/catch` silencioso

---

## 5. Logs inconsistentes e visual da CLI poluido

### Problema

A aplicacao mistura `console.*`, `process.stdout.write`, monkeypatch global de stdout e prompts interativos.

### Evidencia do problema

- [src/modules/repl/services/repl.service.ts:67](./src/modules/repl/services/repl.service.ts) intercepta `process.stdout.write`
- [src/modules/tasks/services/task-management.service.ts:83](./src/modules/tasks/services/task-management.service.ts) escreve status cru no terminal
- [src/modules/repl/services/welcome-screen.service.ts:29](./src/modules/repl/services/welcome-screen.service.ts) usa `console.log`
- [src/modules/mcp/services/mcp-client.service.ts:78](./src/modules/mcp/services/mcp-client.service.ts) usa `console.error`

### Local do problema

- REPL
- tasks
- MCP
- config commands

### Como reproduzir esse problema

1. Rodar a CLI
2. Usar `/help`
3. Usar `/project`
4. Digitar `@sr` e navegar em sugestoes

### Resultado atual

Aparecem artefatos ANSI, reposicionamento visivel de cursor e mistura de mensagens de UI com logs tecnicos.

### Solucao esperada pra ele

Uma saida consistente, sem lixo visual e com niveis de log claros.

### Ideias de como arrumar o problema

- criar `CliOutputService`
- criar `AppLoggerService`
- separar stream de UI e stream de logs
- parar de monkeypatch global
- padronizar status line, tool output e prompts

---

## 6. Comandos com drift entre implementacao e roteamento

### Problema

Existem comandos implementados mas mortos, e os comandos reais usam outro fluxo.

### Evidencia do problema

- [src/modules/repl/services/commands/repl-commands.service.ts:174](./src/modules/repl/services/commands/repl-commands.service.ts) implementa `cmdConfig`
- [src/modules/repl/services/commands/repl-commands.service.ts:203](./src/modules/repl/services/commands/repl-commands.service.ts) implementa `cmdInit`
- o roteamento real usa [src/modules/repl/services/repl.service.ts:312](./src/modules/repl/services/repl.service.ts) e [src/modules/repl/services/repl.service.ts:318](./src/modules/repl/services/repl.service.ts)

### Local do problema

- [src/modules/repl/services/repl.service.ts](./src/modules/repl/services/repl.service.ts)
- [src/modules/repl/services/commands/repl-commands.service.ts](./src/modules/repl/services/commands/repl-commands.service.ts)

### Como reproduzir esse problema

1. Seguir o switch de comandos do REPL
2. Comparar com os metodos realmente implementados

### Resultado atual

Ha codigo morto e confusao sobre qual e o fluxo verdadeiro do comando.

### Solucao esperada pra ele

Cada comando deve ter exatamente uma implementacao valida e um unico ponto de roteamento.

### Ideias de como arrumar o problema

- centralizar roteamento em um registry de comandos
- apagar comandos mortos
- adicionar teste de cobertura para todos os comandos documentados

---

## 7. Wrapper de Git fragil e erro cru ao usuario

### Problema

Os comandos git fazem shell-out direto e expoem erro de infraestrutura ao usuario.

### Evidencia do problema

- [src/modules/repl/services/commands/git-commands.service.ts:26](./src/modules/repl/services/commands/git-commands.service.ts) usa `execSync(cmd)` diretamente
- no teste real, `/status`, `/diff` e `/log` retornaram `spawnSync /bin/sh EPERM`

### Local do problema

- [src/modules/repl/services/commands/git-commands.service.ts](./src/modules/repl/services/commands/git-commands.service.ts)

### Como reproduzir esse problema

1. Abrir a CLI
2. Executar `/status`
3. Executar `/diff`
4. Executar `/log`

### Resultado atual

O usuario recebe erro bruto de shell em vez de erro de dominio.

### Solucao esperada pra ele

Erro traduzido para algo como `nao foi possivel executar git neste ambiente`.

### Ideias de como arrumar o problema

- encapsular execucao de git em `GitProcessService`
- normalizar erros
- validar binario antes de executar
- diferenciar `sem git`, `sem permissao` e `repo invalido`

---

## 8. Tool `shell_background` com documentacao errada e ciclo de vida incompleto

### Problema

A tool promete uma ferramenta que nao existe e nao oferece fechamento limpo do processo.

### Evidencia do problema

- [src/modules/tools/services/shell-tools.service.ts:119](./src/modules/tools/services/shell-tools.service.ts) cita `task_output`
- os helpers reais ficaram fora do registry em [src/modules/tools/services/shell-tools.service.ts:136](./src/modules/tools/services/shell-tools.service.ts) e [src/modules/tools/services/shell-tools.service.ts:150](./src/modules/tools/services/shell-tools.service.ts)
- o registry so publica o que esta em [src/modules/tools/services/tools-registry.service.ts:25](./src/modules/tools/services/tools-registry.service.ts)

### Local do problema

- [src/modules/tools/services/shell-tools.service.ts](./src/modules/tools/services/shell-tools.service.ts)
- [src/modules/tools/services/tools-registry.service.ts](./src/modules/tools/services/tools-registry.service.ts)

### Como reproduzir esse problema

1. Pedir para um agente usar `shell_background`
2. Receber um `processId`
3. Tentar consultar output ou encerrar com uma tool publicada

### Resultado atual

Nao existe conjunto publico coerente para acompanhar ou matar o processo em background.

### Solucao esperada pra ele

Conjunto consistente como:
- `shell_background`
- `shell_background_output`
- `shell_background_kill`

### Ideias de como arrumar o problema

- publicar as tools faltantes
- corrigir a descricao
- remover processos finalizados do mapa
- incluir timeout/cleanup automatico

---

## 9. Contratos e DTOs fracos em skills, tasks e MCP

### Problema

O sistema perde type-safety em areas centrais.

### Evidencia do problema

- [src/modules/skills/types/skill.types.ts:17](./src/modules/skills/types/skill.types.ts) usa `unknown[]`
- [src/modules/tasks/types/task.types.ts:22](./src/modules/tasks/types/task.types.ts) usa `Record<string, any>`
- [src/modules/mcp/services/mcp-registry.service.ts:102](./src/modules/mcp/services/mcp-registry.service.ts) e [src/modules/mcp/services/mcp-registry.service.ts:105](./src/modules/mcp/services/mcp-registry.service.ts) convertem schema complexo para `any`

### Local do problema

- types de `skills`
- types de `tasks`
- adapter de MCP

### Como reproduzir esse problema

1. Inspecionar os tipos expostos
2. Tentar enriquecer validacao/autocomplete nessas estruturas

### Resultado atual

As estruturas aceitam dados demais e validam pouco.

### Solucao esperada pra ele

DTOs explicitos e schemas fortes para cada fluxo.

### Ideias de como arrumar o problema

- trocar `unknown[]` por `StructuredTool[]`
- criar `TaskMetadataDto` por dominio
- introduzir schemas Zod para frontmatter, tasks e payloads MCP
- parar de retornar JSON string quando o contrato ja e estruturado

---

## 10. Injecao de skills/subagentes mascara erro de configuracao

### Problema

Agente com skill invalida continua "funcionando" com fallback generico.

### Evidencia do problema

- [src/modules/agents/services/agent-registry.service.ts:27](./src/modules/agents/services/agent-registry.service.ts) resolve skills
- [src/modules/agents/services/agent-registry.service.ts:30](./src/modules/agents/services/agent-registry.service.ts) cai para ferramentas genericas se nada for encontrado
- os loaders aceitam markdown sem validacao em [src/modules/agents/services/agent-loader.service.ts:27](./src/modules/agents/services/agent-loader.service.ts) e [src/modules/skills/services/skill-loader.service.ts:26](./src/modules/skills/services/skill-loader.service.ts)

### Local do problema

- registry de agents
- loaders de agents e skills

### Como reproduzir esse problema

1. Criar uma skill inexistente em um markdown de agent
2. Iniciar a CLI
3. Inspecionar as tools do agent

### Resultado atual

O erro vira comportamento generico, em vez de falha explicita de configuracao.

### Solucao esperada pra ele

Erro claro de boot ou warning visivel para skill invalida.

### Ideias de como arrumar o problema

- validar frontmatter com Zod
- rejeitar agent invalido
- emitir warning estruturado no load
- expor `/agents doctor` e `/skills doctor`

---

## 11. `ReplService` grande demais e modularizacao insuficiente

### Problema

O REPL central concentra orquestracao, renderizacao, broadcast remoto, input, spinner e roteamento.

### Evidencia do problema

- [src/modules/repl/services/repl.service.ts:35](./src/modules/repl/services/repl.service.ts) injeta muitos servicos
- [src/modules/repl/services/repl.service.ts:63](./src/modules/repl/services/repl.service.ts) cuida de stdout global
- [src/modules/repl/services/repl.service.ts:300](./src/modules/repl/services/repl.service.ts) faz roteamento extenso

### Local do problema

- [src/modules/repl/services/repl.service.ts](./src/modules/repl/services/repl.service.ts)

### Como reproduzir esse problema

1. Tentar alterar comportamento de comando
2. Tentar alterar renderizacao
3. Tentar alterar fluxo de input

### Resultado atual

Mudancas pequenas exigem mexer no mesmo arquivo e aumentam risco de regressao lateral.

### Solucao esperada pra ele

REPL como orquestrador fino, com handlers e servicos especializados.

### Ideias de como arrumar o problema

- criar `CommandRouter`
- criar `TerminalRenderer`
- criar `RemoteBroadcastBridge`
- criar `ConversationController`
- reduzir `ReplService` para coordenacao

---

## 12. Personalizacao da CLI quase inexistente

### Problema

Cores, icones, historico e welcome screen sao hardcoded.

### Evidencia do problema

- [src/modules/repl/utils/theme.ts:1](./src/modules/repl/utils/theme.ts) fixa a paleta
- [src/modules/repl/services/welcome-screen.service.ts:103](./src/modules/repl/services/welcome-screen.service.ts) fixa os tips
- [src/modules/repl/services/smart-input.ts:24](./src/modules/repl/services/smart-input.ts) mantem historico so em memoria

### Local do problema

- tema
- welcome screen
- smart input

### Como reproduzir esse problema

1. Reiniciar a CLI
2. Tentar recuperar historico
3. Tentar mudar cor/prompt sem editar codigo

### Resultado atual

Nao ha configuracao real de experiencia da CLI.

### Solucao esperada pra ele

Historico persistente e opcoes de customizacao no config.

### Ideias de como arrumar o problema

- criar secao `cli` no `config.yaml`
- permitir tema, icones, prompt, largura e flags de animacao
- salvar historico em `~/.cast/history`

---

## 13. Codigo morto/legado acumulando ruido

### Problema

Ha servicos e metodos sem uso real, o que confunde manutencao.

### Evidencia do problema

- [src/common/services/llm.service.ts:7](./src/common/services/llm.service.ts)
- [src/common/services/config.service.ts:34](./src/common/services/config.service.ts)
- [src/modules/skills/services/skill-registry.service.ts:54](./src/modules/skills/services/skill-registry.service.ts)
- [src/modules/tasks/services/task-management.service.ts:217](./src/modules/tasks/services/task-management.service.ts)
- [src/modules/tasks/services/task-management.service.ts:276](./src/modules/tasks/services/task-management.service.ts)

### Local do problema

- `common`
- `skills`
- `tasks`
- `repl`
- `tools`

### Como reproduzir esse problema

1. Buscar referencias com `rg`
2. Comparar com o fluxo principal do runtime

### Resultado atual

APIs legadas ou ociosas seguem na base e aumentam custo cognitivo.

### Solucao esperada pra ele

Base limpa, com menos caminhos paralelos e menos contratos legados.

### Ideias de como arrumar o problema

- rodar limpeza controlada
- remover o que esta morto
- ou marcar como legado de forma explicita ate migrar

---

## 14. `readFiles` cresce sem limpeza e o codigo das tools repete padroes demais

### Problema

A tool de filesystem mistura regra de negocio, parsing de input e formatacao, e ainda acumula estado indefinidamente.

### Evidencia do problema

- [src/modules/tools/services/filesystem-tools.service.ts:25](./src/modules/tools/services/filesystem-tools.service.ts) mantem `readFiles`
- [src/modules/tools/services/filesystem-tools.service.ts:42](./src/modules/tools/services/filesystem-tools.service.ts), [src/modules/tools/services/filesystem-tools.service.ts:152](./src/modules/tools/services/filesystem-tools.service.ts) e [src/modules/tools/services/filesystem-tools.service.ts:204](./src/modules/tools/services/filesystem-tools.service.ts) repetem parsing de `input as any`

### Local do problema

- [src/modules/tools/services/filesystem-tools.service.ts](./src/modules/tools/services/filesystem-tools.service.ts)

### Como reproduzir esse problema

1. Manter uma sessao longa com muitos `read_file`
2. Observar que o set so cresce
3. Tentar manter ou evoluir a classe

### Resultado atual

Estado cresce sem controle e a manutencao da classe fica dificil.

### Solucao esperada pra ele

Tool service menor, com DTO de entrada, estado controlado e responsabilidades separadas.

### Ideias de como arrumar o problema

- extrair `ToolPathResolver`
- extrair `ToolInputNormalizer`
- extrair `FileReadPolicy`
- usar schemas Zod com transform
- limpar `readFiles` por sessao ou por compactacao

---

## Fases Praticas

### Fase 1, critica

- item 1
- item 2
- item 3
- item 5

### Fase 2, arquitetura

- item 6
- item 9
- item 10
- item 11

### Fase 3, UX e acabamento

- item 8
- item 12
- item 13
- item 14

### Fase 4, validacao final

- rerodar CLI
- smoke test de comandos
- cobertura minima de regressao

---

## Smoke Test Recomendado ao Final

Rodar estes fluxos apos as correcoes:

1. `npm run build`
2. `npm run typecheck`
3. `npm run lint:check`
4. abrir CLI com `node dist/main.js`
5. testar `/help`
6. testar `/context`
7. testar `/project`
8. testar autocomplete com `@`
9. testar `/status`, `/diff`, `/log`
10. testar um fluxo de agente com skill valida e outro com skill invalida
11. testar `shell_background` com output e kill
12. testar persistencia de historico e configuracao visual
