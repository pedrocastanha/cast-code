# Spec — Correções de `split-up` e redesign do `branch-split`

> Feature: `split-tools-fixes` · Status: Specified · Escopo: Large
> Última atualização: 2026-06-15

## 1. Contexto

Duas features recentes apresentam problemas em produção:

- **`cast split-up` / `/split-up`** (handler `GitCommandsService.cmdSplitUp`,
  `git-commands.service.ts:247`) não dá feedback de progresso durante a chamada
  ao LLM, vaza stderr cru do `git`, e gera mensagens duplicadas/mal formatadas
  quando não há nada para commitar.
- **`/branch-split`** (`BranchSplitService`, `branch-split.service.ts`) hoje gera
  PRs **paralelas** cortadas da merge-base, agrupadas por **contagem de arquivos**
  (≤20). O objetivo passa a ser PRs **empilhadas (stacked)** por **orçamento de
  linhas** (200-300), com cadeia de dependência sequencial.

### Decisões do usuário (2026-06-15)

| # | Decisão | Valor escolhido |
|---|---------|-----------------|
| D1 | Modelo da stack | **Stack real até a target**: `PR1 base=target`, `PR2 base=branch1`, `PR3 base=branch2`… Merge desce a stack (PR1 primeiro). Substitui o modelo review-only atual. |
| D2 | Unidade do orçamento de linhas | **added + removed** (numstat). Arquivo único indivisível acima de 300 vira seu próprio PR (overflow permitido, igual ao "oversized" atual). |
| D3 | Granularidade | **Hunk-level** (revisado 2026-06-15): linhas alteradas de um mesmo arquivo podem cair em slices diferentes. Hunks são base-relativos; cada slice recebe um subconjunto de hunks por arquivo. Quando o arquivo inteiro pertence a um só concern, todos os hunks ficam juntos (degenera para arquivo inteiro). |

## 2. Objetivos / Não-objetivos

**Objetivos**
- Feedback de progresso visível e input que não acumula duplicatas no `split-up`.
- Saída limpa (sem stderr cru do git) e mensagem única em estados vazios.
- `branch-split` empilhado por linhas, com PR descriptions ricas refletindo a posição na stack.

**Não-objetivos**
- Split sub-arquivo (por hunk/commit) — explicitamente fora (D3).
- Mudar provider/modelo de LLM.
- Reescrever o fluxo de `cmdPr` / `cmdCommit`.

## 3. Requisitos

### Cluster A — `split-up`: progresso e ruído

- **REQ-A1** — Durante `commitGenerator.splitCommits()` (chamada async ao LLM, uma
  invocação por grupo em `commit-generator.service.ts:173-176`), exibir spinner
  animado com texto de progresso `[i/n] <grupo>`, reaproveitando o padrão já usado
  em `cmdUnitTest` (`git-commands.service.ts:619-645`). Limpar a linha do spinner
  ao terminar (`\r\x1b[K`).
  - **Done when**: ao rodar `/split-up` o usuário vê um spinner contínuo do início
    da análise até o painel de commits aparecer.

- **REQ-A2** — Enquanto `cmdSplitUp` está em execução, submissões repetidas de
  `/split-up` não devem enfileirar e re-executar o comando. O input fica
  travado/drenado durante o processamento (a queue visível "Queued (1/2)" não
  ocorre mais para o mesmo comando em andamento).
  - **Done when**: digitar `/split-up` várias vezes durante a análise resulta em
    no máximo uma execução; submissões extras são ignoradas ou descartadas.

- **REQ-A3** — `executeSplitCommits` (`commit-generator.service.ts:209-231`) não
  pode vazar stderr do git para o terminal. As linhas `warning: could not open
  directory '...': Arquivo ou diretório inexistente` somem. Causa: `execSync` usa
  stderr=inherit por padrão; capturar stderr (`stdio: ['pipe','pipe','pipe']` ou
  redirecionar) em todos os `git add`/`git commit` do loop.
  - **Done when**: nenhuma linha `warning: could not open directory` aparece na
    saída do `/split-up`.

- **REQ-A4** — Arquivos propostos pelo LLM que não existem mais na working tree
  (deletados/renomeados/diretórios) são filtrados antes do `git add`, sem ruído. Se
  um grupo ficar vazio após o filtro, é pulado silenciosamente (já existe `if
  (!staged.trim()) continue;` em `:227` — garantir que o add que falha não imprime).
  - **Done when**: paths inexistentes são ignorados limpa­mente; o resumo final de
    commits permanece correto.

### Cluster B — estado vazio limpo

- **REQ-B1** — Quando não há mudanças, `cmdSplitUp` emite **uma** mensagem limpa
  (`! No changes to commit` via `ui.warning`) corretamente posicionada em relação
  ao prompt do REPL (sem interleave com `> Ask Cast anything...`). Como a duplicação
  observada é sintoma do REQ-A2 (comandos enfileirados rodando após o commit),
  resolver A2 elimina as repetições; B1 garante o rendering single-shot.
  - **Done when**: `/split-up` sem mudanças mostra exatamente uma mensagem, bem
    formatada, sem sobrepor o prompt.

### Cluster C — `branch-split` empilhado (stacked)

- **REQ-C1** — Agrupamento por **orçamento de linhas** (D2) em granularidade
  **hunk** (D3): a unidade atômica de agrupamento é o hunk (bloco contíguo do diff
  base-relativo). Cada slice mira 200-300 linhas (added+removed). Substitui
  `MAX_FILES_PER_BRANCH=20` / `MIN_FILES_PER_BRANCH=5`. Um único hunk indivisível
  acima de 300 linhas é permitido como slice próprio (overflow).
  - **Done when**: cada slice (exceto overflow indivisível) soma ≤ ~300 linhas; a
    cobertura é completa e disjunta no nível de **hunk** (todo hunk em exatamente um
    slice; nenhum hunk duplicado/omitido).

- **REQ-C2** — Grupos são **ordenados por dependência**: o slice 1 é a alteração
  fundacional ("alteração chave") que as demais dependem; cada slice subsequente
  depende do anterior. A ordem é produzida pela harness (REQ-C5) e preservada na
  criação das branches e PRs.
  - **Done when**: `manifest.json` lista as branches na ordem de dependência
    (fundacional → dependente).

- **REQ-C3** — Criação **empilhada** das branches em granularidade hunk (substitui
  `createBranches`, `branch-split.service.ts:174-230`):
  - `branch1` é cortada de **`target`** (não da merge-base).
  - `branch_i` (i>1) é cortada do **HEAD de `branch_{i-1}`**.
  - Para cada arquivo tocado pelo slice i, o conteúdo é **reconstruído a partir da
    versão base** aplicando os hunks acumulados desse arquivo até o slice i
    (slices 1..i). Como os hunks são base-relativos e independentes, qualquer
    subconjunto aplica limpo sobre a versão base. O commit em `branch_i` contém
    apenas o delta do slice i.
  - **Invariante**: a árvore de `branch_n` (última) é idêntica à árvore do `HEAD`
    atual (a stack reconstrói o diff completo).
  - **Done when**: `git diff branch_n HEAD` é vazio; cada `git diff branch_{i-1}
    branch_i` mostra apenas os hunks do slice i.

- **REQ-C4** — PRs em cadeia (D1): `PR1 base=target head=branch1`; `PR_i
  base=branch_{i-1} head=branch_i`. Atualizar `createPullRequests`
  (`branch-split.service.ts:309-364`) que hoje usa `base=manifest.current` fixo para
  ler a base por-branch do manifesto.
  - **Done when**: cada PR aberta usa a base correta da cadeia; o GitHub exibe só o
    diff incremental de cada slice.

- **REQ-C5** — Harness de agrupamento (substitui `branch-split-prompts.ts` +
  `groupFiles`): o prompt recebe numstat por arquivo (added/deleted) e produz grupos
  **ordenados por dependência** respeitando o orçamento de linhas (D2). Cada grupo
  inclui `name`, `responsibility`, `commit`, `files`, e metadados de stack
  (`dependsOn`: índice/responsabilidade do slice anterior). Mantém retry com
  validação (atual `groupFiles` tenta 2x com feedback de erro).
  - **Done when**: a harness retorna grupos válidos (cobertura completa, disjunta,
    ordenados) na maioria dos casos; falha com mensagem clara após 2 tentativas.

- **REQ-C6** — PR descriptions refletem a posição na stack: cada `PR.md` declara
  base/head, "Depends on" (slice anterior), "Required by" (próximo slice), resumo do
  slice e lista de arquivos. Reaproveitar `pr-generator.service.ts`
  `generatePRDescription` alimentando o contexto de stack.
  - **Done when**: `.branches/<dir>/PR.md` mostra base correta, dependências e
    descrição coerente com o slice.

- **REQ-C7** — Manifesto e artefatos (`writeArtifacts`,
  `branch-split.service.ts:232-299`) registram, por branch: `base` (target ou branch
  anterior), `order`, `linesAdded`/`linesDeleted`. `README.md` reflete a natureza
  stacked (não mais "merge é no-op"); descreve ordem de review e merge top-down.
  - **Done when**: `manifest.json` tem base/order/linhas por branch; README descreve
    fluxo stacked.

## 4. Design (Cluster C — o complexo)

### 4.1 Fluxo

```
analyzeDiff(target)
  → numstat por arquivo (added+deleted)        # novo
  → groupFilesStacked(analysis)                # harness ordenada por dependência + budget
  → createStackedBranches(analysis, groups)    # branch_i a partir de branch_{i-1}
  → generate PR descriptions (stack-aware)     # base/depends-on/required-by
  → writeArtifacts (manifest com base+order+linhas)
createPullRequests → base por-branch do manifesto
```

### 4.2 Estruturas (diffs sobre os tipos atuais)

```ts
// BranchSplitGroup += metadados de stack/linhas
interface BranchSplitGroup {
  name: string;
  responsibility: string;
  commit: string;
  files: string[];
  order: number;          // 1..n, ordem de dependência
  dependsOn?: number;     // order do slice anterior (undefined p/ o slice 1)
  linesAdded: number;
  linesDeleted: number;
}

// CreatedBranch += base da cadeia
interface CreatedBranch {
  // ...campos atuais...
  base: string;           // "target" p/ branch1, senão branch_{i-1}
  order: number;
  linesAdded: number;
  linesDeleted: number;
}
```

### 4.3 Motor de hunks

```
parseHunks(file): a partir de `git diff <base>..HEAD -- file`, extrai a lista de
  hunks (cabeçalho @@, contexto, +/- lines). Cada hunk vira uma unidade atômica
  identificada por (file, hunkIndex) com peso = added+deleted.

reconstructFile(file, hunkSubset): pega o blob base do arquivo (`git show
  base:file`, vazio se status A) e aplica APENAS os hunks do subconjunto, gerando
  um patch unificado com header do arquivo + hunks selecionados, via `git apply`.
  Subconjunto base-relativo aplica sempre limpo (hunks independentes).
```

### 4.4 Algoritmo de criação empilhada (hunk-level)

```
parent = target
acc = {}                                              # file -> hunks acumulados
for i, group in enumerate(groups, start=1):
    branch_i = splitBranchName(current, i, group.name)
    git branch branch_i <parent>
    worktree add branch_i
      for file in group.files:
          acc[file] += group.hunks[file]               # acumula hunks 1..i
          content = reconstructFile(file, acc[file])   # base + hunks(1..i)
          escreve content (ou rm se vira vazio/deletado)
          git add file
      git commit -m group.commit                       # delta = hunks do slice i
    parent = branch_i
assert git diff branch_n HEAD == ∅
```

### 4.5 Orçamento de linhas

- Peso de cada hunk = added+deleted (D2). Harness recebe a lista de hunks por
  arquivo (id, peso, trecho resumido) e agrupa mirando 200-300 por slice na ordem de
  dependência. Pós-validação: grupo > ~300 com >1 hunk → warning (não bloqueia);
  hunk único overflow é aceito.

## 5. Tarefas (outline — detalhar em tasks.md se necessário)

| ID | Tarefa | Arquivos | Dep |
|----|--------|----------|-----|
| T1 | Spinner + progress no `cmdSplitUp` | `git-commands.service.ts` | — |
| T2 | Lock/drain de input durante comando em execução | repl input/queue + `cmdSplitUp` | — |
| T3 | Capturar stderr do git em `executeSplitCommits`; filtrar paths inexistentes | `commit-generator.service.ts` | — |
| T4 | Estado vazio single-shot | `cmdSplitUp` | T2 |
| T5 | numstat por arquivo em `analyzeDiff` | `branch-split.service.ts` | — |
| T6 | Harness ordenada por dependência + budget (prompts + `groupFiles`) | `branch-split-prompts.ts`, `branch-split.service.ts` | T5 |
| T7 | `createStackedBranches` (cadeia) + invariante | `branch-split.service.ts` | T6 |
| T8 | Base por-branch em manifest + `writeArtifacts` + README stacked | `branch-split.service.ts` | T7 |
| T9 | `createPullRequests` base por-branch | `branch-split.service.ts` | T8 |
| T10 | PR descriptions stack-aware (depends-on/required-by) | `git-commands.service.ts`, `pr-generator.service.ts` | T7 |
| T11 | Atualizar specs `branch-split.service.spec.ts` p/ modelo stacked | `branch-split.service.spec.ts` | T7-T9 |

## 6. Verificação

- A: rodar `/split-up` com mudanças → spinner visível, sem `warning: could not
  open directory`, sem queue duplicada. Rodar sem mudanças → uma única mensagem.
- C: `npm test` (specs do git module) verde; `git diff branch_n HEAD` vazio;
  inspeção de `.branches/manifest.json` (base/order/linhas) e PR.md.

## 7. Riscos

- **R1**: stacked branches divergem se a working tree muda entre análise e criação
  (`analyzeDiff` já exige árvore limpa — manter).
- **R2**: arquivo tocado por múltiplos "concerns" cai inteiro no slice mais cedo que
  o referencia → slices posteriores podem assumir conteúdo que só existe lá. Mitiga
  pela ordenação por dependência (REQ-C2) e granularidade file-level (D3).
- **R3**: orçamento de linhas vs. coesão semântica podem conflitar; budget é meta,
  não trava rígida (overflow permitido).
