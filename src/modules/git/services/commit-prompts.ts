import { ConventionalCommitType } from '../types/git.types';

const COMMIT_TYPES: ConventionalCommitType[] = [
  'feat', 'fix', 'docs', 'style', 'refactor',
  'perf', 'test', 'build', 'ci', 'chore',
];

export function commitSystemPrompt(lang: string): string {
  if (lang === 'en') {
    return `You are an expert at writing Conventional Commits messages.

Allowed types: ${COMMIT_TYPES.join(', ')}

Required format:
- With scope:    <type>(<scope>): <description>
- Without scope: <type>: <description>
- Breaking:      <type>(<scope>)!: <description>

Rules:
- Full subject max 100 characters
- Description in English, imperative mood, no trailing period
- Be specific; avoid generic messages
- Use scope when clear
- feat and fix must be used semantically

Return ONLY the commit line, no explanations.`;
  }

  return `Você é especialista em mensagens de commit no padrão Conventional Commits.

Tipos permitidos: ${COMMIT_TYPES.join(', ')}

Formato obrigatório:
- Com escopo:    <type>(<scope>): <descrição>
- Sem escopo:    <type>: <descrição>
- Breaking:      <type>(<scope>)!: <descrição>

Regras:
- Assunto completo com no máximo 100 caracteres
- Descrição em português (pt-BR), no imperativo, sem ponto final
- Seja específico e evite mensagens genéricas
- Use escopo quando estiver claro
- feat e fix devem ser usados semanticamente

Retorne SOMENTE a linha do commit, sem explicações.`;
}

export function splitSystemPrompt(lang: string): string {
  if (lang === 'en') {
    return `You are an expert at organizing diffs into logical commits.

Task:
- Group changes by functional cohesion
- Correctly separate feat, fix, docs, refactor, etc.
- Every file must appear exactly once

Response format — return ONLY valid JSON:
\`\`\`json
{
  "commits": [
    {
      "type": "feat",
      "files": ["src/chatbot/service.ts"],
      "description": "add chatbot service"
    }
  ]
}
\`\`\`

Rules:
- Allowed types: ${COMMIT_TYPES.join(', ')}
- Each commit must have a clear, single purpose
- Descriptions in English, imperative mood, no trailing period
- Max 5 files per commit recommended
- Can return 1 commit if the diff is small and cohesive

Return ONLY the JSON, no extra text.`;
  }

  return `Você é especialista em organizar diffs em commits lógicos.

Tarefa:
- Agrupar mudanças por coesão funcional
- Separar corretamente feat, fix, docs, refactor etc.
- Cada arquivo deve aparecer exatamente uma vez

Formato de resposta — retorne SOMENTE JSON válido:
\`\`\`json
{
  "commits": [
    {
      "type": "feat",
      "files": ["src/chatbot/service.ts"],
      "description": "adiciona service de chatbot"
    }
  ]
}
\`\`\`

Regras:
- Tipos permitidos: ${COMMIT_TYPES.join(', ')}
- Cada commit com propósito claro e único
- Descrições em português (pt-BR), no imperativo, sem ponto final
- Máximo recomendado de 5 arquivos por commit
- Pode retornar 1 commit se o diff for pequeno e coeso

Retorne SOMENTE o JSON, sem texto adicional.`;
}

export function refineSystemPrompt(lang: string): string {
  if (lang === 'en') {
    return `You are refining a commit message based on user feedback.

Instructions:
- Follow Conventional Commits
- Max 100 characters
- Description in English, imperative mood, no trailing period
- Incorporate the user's suggestion without losing technical precision

Return ONLY the new commit line.`;
  }

  return `Você está refinando uma mensagem de commit a partir do feedback do usuário.

Instruções:
- Respeite Conventional Commits
- Máximo 100 caracteres
- Descrição em português (pt-BR), no imperativo, sem ponto final
- Incorpore a sugestão do usuário sem perder precisão técnica

Retorne SOMENTE a nova linha de commit.`;
}

export function buildCommitHumanPrompt(lang: string, scopeHint: string, fullDiff: string): string {
  const types = COMMIT_TYPES.join(', ');

  if (lang === 'en') {
    return `Analyze ALL the changed context and generate ONE commit message following Conventional Commits.

${scopeHint}

Mandatory rules:
- Format: "type(scope): description", "type: description", or breaking "type(scope)!: description"
- Allowed types: ${types}
- Description in English, imperative mood, no trailing period, concise
- Max 100 characters total
- The message must reflect the main intent of the full set of changes
- If breaking change, include "!" after type/scope
- Consider staged, unstaged and new files

Diff context:
${fullDiff}`;
  }

  return `Analise TODO o contexto de mudanças e gere UMA mensagem de commit no padrão Conventional Commits.

${scopeHint}

Regras obrigatórias:
- Formato: "type(scope): descrição", "type: descrição" ou com breaking "type(scope)!: descrição"
- Tipos permitidos: ${types}
- Descrição em português (pt-BR), no imperativo, sem ponto final, objetiva
- Máximo de 100 caracteres no assunto completo
- A mensagem deve refletir a intenção principal do conjunto total de mudanças
- Se for breaking change, inclua "!" após o type/scope
- Considere staged, unstaged e arquivos novos

Contexto do diff:
${fullDiff}`;
}

export function buildSplitHumanPrompt(lang: string, filesList: string, fullDiff: string): string {
  const types = COMMIT_TYPES.join(', ');

  if (lang === 'en') {
    return `Analyze the full diff and split it into logical commits following Conventional Commits.

Mandatory rules:
- Each file from the list must appear exactly once in the result
- Include ALL listed files
- Separate changes by functional cohesion (feat, fix, docs, refactor, etc.)
- Avoid mixing different objectives in the same commit
- Allowed types: ${types}
- Descriptions in English, imperative mood, no trailing period

Expected files:
${filesList}

Diff context:
${fullDiff}`;
  }

  return `Analise o diff completo e divida em commits lógicos no padrão Conventional Commits.

Regras obrigatórias:
- Cada arquivo da lista deve aparecer exatamente uma vez no resultado
- Inclua TODOS os arquivos listados
- Separe mudanças por coesão funcional (feat, fix, docs, refactor etc.)
- Evite misturar objetivos diferentes no mesmo commit
- Tipos permitidos: ${types}
- Descrições em português (pt-BR), no imperativo, sem ponto final

Arquivos esperados:
${filesList}

Contexto do diff:
${fullDiff}`;
}

export function buildGroupHumanPrompt(
  lang: string,
  type: string,
  scopePart: string,
  files: string[],
  description: string,
): string {
  if (lang === 'en') {
    return `Generate a Conventional Commit message (max 100 characters) for this group:

Type: ${type}${scopePart}
Files: ${files.join(', ')}
Summary: ${description}

Return ONLY one line in the format:
"type(scope): description", "type: description", or "type(scope)!: description"

Description in English, imperative mood, no trailing period.`;
  }

  return `Gere uma mensagem Conventional Commit (máximo 100 caracteres) para este grupo:

Tipo: ${type}${scopePart}
Arquivos: ${files.join(', ')}
Resumo: ${description}

Retorne APENAS uma linha no formato:
"type(scope): descrição", "type: descrição" ou "type(scope)!: descrição"

Descrição em português (pt-BR), no imperativo, sem ponto final.`;
}

export function buildRefineHumanPrompt(
  lang: string,
  currentMessage: string,
  userSuggestion: string,
  diffContext: string,
): string {
  if (lang === 'en') {
    return `Current message: ${currentMessage}

User suggestion: ${userSuggestion}

Diff context:
${diffContext}`;
  }

  return `Mensagem atual: ${currentMessage}

Sugestão do usuário: ${userSuggestion}

Contexto do diff:
${diffContext}`;
}
