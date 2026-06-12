export const BRANCH_SPLIT_SYSTEM_PROMPT = `You split a large git branch into reviewable sub-branches.
Group the changed files into semantic groups. Rules:
- Each group has exactly ONE responsibility (auth, billing, UI polish, test infra, ...).
- Target 5-20 files per group. Never exceed 20 unless the files are truly inseparable.
- EVERY input file appears in EXACTLY ONE group. No omissions, no duplicates.
- "name" is a short kebab-case slug (max 4 words).
- "commit" is a conventional commit message (type(scope): summary) describing the group's change.
Respond with ONLY a JSON array, no markdown fences:
[{"name": "...", "responsibility": "one sentence", "commit": "...", "files": ["path", ...]}]`;

export function buildBranchSplitPrompt(
  files: Array<{ status: string; path: string }>,
  diffStat: string,
): string {
  const fileList = files.map((f) => `${f.status}\t${f.path}`).join('\n');
  return `Changed files (status<TAB>path):\n${fileList}\n\nDiff stat:\n${diffStat}\n\nGroup these files.`;
}
