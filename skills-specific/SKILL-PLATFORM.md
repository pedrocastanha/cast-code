# cast-platform — feature de plano de controle remoto

## O que é esta feature

O módulo `platform` transforma o cast em um produto gerenciado. O dev autentica via API key, vincula um diretório local a um projeto da plataforma, e o cast passa a puxar skills e agents remotamente — mantendo tudo que funciona localmente.

A plataforma é o plano de controle. O CLI é o executor. Configurações feitas no dashboard web ficam disponíveis automaticamente no terminal do dev.

---

## Fluxo de boot com plataforma

```
1. cast inicia em /projeto
2. detecta .cast/platform.yaml → { projectId, apiKeyEnv, apiUrl }
3. lê API key da variável de ambiente (ex: CAST_API_KEY)
4. GET /v1/auth/me              → valida key, retorna plan + features
5. GET /v1/projects/:id         → skills[], agents[], settings
6. merge com .cast/skills/ local (local tem prioridade por nome)
7. POST /v1/sessions            → abre sessão, recebe sessionId
8. CLI inicializa com skills + agents mesclados
9. durante sessão: eventos buffered em memória
10. flush a cada 30s + no SIGTERM/SIGINT
```

Se a API não responder em 2 segundos, o cast inicializa com o cache local e a sessão é marcada como `offline`. Ao reconectar, envia os eventos pendentes antes de abrir nova sessão.

---

## Arquivo .cast/platform.yaml

Criado pelo comando `cast link --project <id>`. Fica no diretório do projeto (não no global `~/.cast/`).

```yaml
projectId: "uuid-do-projeto"
apiKeyEnv: "CAST_API_KEY"       # nome da variável de ambiente com a key
apiUrl: "https://api.castplatform.dev"  # pode ser self-hosted
```

A API key nunca fica neste arquivo — apenas o nome da variável. Isso permite commitar o `platform.yaml` no repo sem expor credenciais.

---

## Módulo platform/ — estrutura

```
src/modules/platform/
  platform.module.ts     NestJS module, registra o módulo
  platform.service.ts    orquestra boot: auth, fetch, merge, cache
  platform.config.ts     leitura e validação do platform.yaml
  session.tracker.ts     buffer de eventos, flush periódico
  skill.merger.ts        merge de skills locais + remotas
```

---

## Merge de skills e agents

### Regra de prioridade

```
local (.cast/skills/) > remoto (plataforma)
```

Se uma skill com o mesmo nome existe localmente e na plataforma, a local vence. O CLI avisa no boot:

```
[platform] skill "code-review" overridden by local version
[platform] 3 remote skills loaded: api-design, commit-style, test-patterns
```

### Como skills remotas ficam disponíveis

Após o merge, skills remotas funcionam exatamente como locais:

- Disponíveis via `@mention` no REPL (`@api-design`)
- Invocadas automaticamente pelo agente principal quando relevante
- Listadas em `/skills`

O formato é idêntico: um nome e um conteúdo markdown. A origem (local ou remoto) é transparente para o agente.

---

## Telemetria — o que é enviado

**Nunca enviar**: conteúdo de prompts, outputs do LLM, código do usuário, mensagens de chat.

**Enviar apenas metadados**:

```typescript
type EventType =
  | 'session.started'     // { castVersion, os, nodeVersion }
  | 'agent.invoked'       // { role, model }
  | 'skill.used'          // { name, source: 'local' | 'remote' }
  | 'command.run'         // { command }  ex: '/up', '/pr', '/review'
  | 'tokens.consumed'     // { input, output, model, cost }
  | 'session.ended'       // { duration, totalTokens, totalCost }
```

### Flush de eventos

```typescript
class SessionTracker {
  // buffer em memória
  private buffer: Event[] = []
  private flushInterval = setInterval(() => this.flush(), 30_000)

  track(type: EventType, payload: object) {
    this.buffer.push({ type, payload, ts: new Date() })
    if (this.buffer.length >= 50) this.flush()  // flush antecipado se buffer cheio
  }

  async flush() {
    if (!this.buffer.length) return
    const events = this.buffer.splice(0)  // esvazia antes do await
    try {
      await api.post(`/v1/sessions/${this.sessionId}/events`, { events })
    } catch {
      pendingQueue.push(...events)  // guarda para retry quando online
    }
  }

  async close() {
    clearInterval(this.flushInterval)
    await this.flush()
    await this.sendPending()
    await api.patch(`/v1/sessions/${this.sessionId}`, { endedAt: new Date() })
  }
}
```

---

## Gatekeeping de comandos por plano

O objeto `features` retornado pelo `/v1/auth/me` controla quais comandos são registrados:

```typescript
// src/modules/repl/repl.module.ts
async registerCommands(features: PlatformFeatures) {
  // comandos base — sempre registrados
  registerCommand('/help', helpHandler)
  registerCommand('/init', initHandler)
  // ...

  // comandos de plano
  if (features.benchAccess) {
    registerCommand('/bench', benchHandler)
  }
}
```

Comandos não registrados não aparecem no `/help` e não geram erro ao digitar — simplesmente não existem para aquele usuário.

---

## Cache local

```
.cast/platform.cache.json

{
  "fetchedAt": "2025-04-27T10:00:00Z",
  "project": { ... },
  "skills": [ ... ],
  "agents": [ ... ],
  "features": { ... }
}
```

- **TTL em memória**: 5 minutos — depois faz re-fetch silencioso em background
- **TTL em disco**: 24 horas — usado se a API estiver offline no boot
- **Invalidação**: se `updatedAt` de qualquer skill/agent remoto for mais novo que o cache, faz re-fetch imediato

---

## Comando `cast link`

```bash
cast link --project <projectId>
# ou interativo:
cast link
# → abre lista de projetos do usuário na plataforma
# → usuário seleciona
# → gera .cast/platform.yaml no diretório atual
# → faz boot de verificação (GET /v1/auth/me)
# → exibe: ✓ Linked to "Nome do Projeto" (3 skills, 2 agents)
```

Se `.cast/platform.yaml` já existe, pergunta se quer sobrescrever.

---

## API endpoints consumidos pelo CLI

```
GET  /v1/auth/me
     Headers: Authorization: Bearer <api_key>
     Response: { userId, plan, features: { remoteAgents, benchAccess, maxSkills, ... } }

GET  /v1/projects/:id
     Response: { project, skills[], agents[], features }

POST /v1/sessions
     Body: { projectId, startedAt, castVersion, os }
     Response: { sessionId }

POST /v1/sessions/:id/events
     Body: { events: [{ type, payload, ts }] }

PATCH /v1/sessions/:id
     Body: { endedAt, totalTokens, totalCost }
```

---

## Pontos críticos desta feature

### Nunca bloquear o REPL
O fetch da API acontece antes do REPL inicializar, mas com timeout de 2 segundos. Se passar disso, inicializa offline. O usuário vê:

```
[platform] API unreachable, starting in offline mode (cached config from 2h ago)
```

### Evitar loop de retry
Se a API estiver fora, o tracker para de tentar em vez de fazer retry infinito. Tenta de novo apenas no próximo boot ou quando detectar conectividade.

### Segurança da API key
- Nunca logar a API key, nem parcialmente
- Nunca enviar a key para nenhum endpoint além de `/v1/auth/*`
- Validar que `apiUrl` no `platform.yaml` é HTTPS em produção

### Conflito de projeto vs global
O cast usa configuração em camadas:
1. `.cast/platform.yaml` do diretório atual (projeto)
2. `~/.cast/config.yaml` (global)

Skills e agents seguem a mesma hierarquia: projeto > global > plataforma.

---

## Módulo RAG — integração com cast-rag

Quando o projeto tem RAG habilitado (`ragEnabled: true` no retorno de `/v1/projects/:id`), o módulo platform:

1. Registra a tool `rag_search` no agente principal (LangChain DynamicStructuredTool)
2. Injeta `agentInstruction` no system prompt do agente
3. Registra o mention especial `@docs` no módulo `mentions/`

```typescript
// em platform.service.ts, após o merge de skills/agents
if (project.ragEnabled && project.ragSettings) {
  agentContext.tools.push(buildRagTool(projectId, project.ragSettings))
  agentContext.systemPromptAdditions.push(buildRagInstruction(project.ragSettings))
  mentionRegistry.register('@docs', ragMentionHandler)
}
```

O `@docs` funciona diferente dos outros mentions — em vez de injetar conteúdo estático, dispara a `rag_search` tool com a query que vem após o mention:

```
@docs como funciona o fluxo de autenticação?
→ rag_search("como funciona o fluxo de autenticação")
→ injeta os chunks retornados no contexto antes de responder
```

Detalhes completos da feature RAG estão em `.cast/skills/cast-rag/SKILL.md`.

---

## Planos e o que cada um habilita no CLI

| Feature | free | pro | team |
|---|---|---|---|
| Projetos | 1 | 10 | ilimitado |
| Skills remotas | 5 | 50 | ilimitado |
| Remote agents | não | sim | sim |
| `/bench run` | não | sim | sim |
| Histórico de sessões | 7 dias | 90 dias | 365 dias |
| Multi-seat | não | não | sim |
