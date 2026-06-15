import type { FileDiff } from './branch-split.service';

export const BRANCH_SPLIT_SYSTEM_PROMPT = `You split a large git branch into a STACK of reviewable pull requests.
The atomic unit is a hunk (one contiguous block of the diff), referenced by its integer id.

Rules:
- Order groups by DEPENDENCY. Group 1 is the foundational change everything else builds on
  and must be reviewed first; each later group depends on the previous one.
- Each group targets 200-300 changed lines (added+removed). A single hunk above that is allowed alone.
- Each group has exactly ONE responsibility (auth, billing, UI polish, test infra, ...).
- EVERY hunk id appears in EXACTLY ONE group. No omissions, no duplicates.
- Hunks of the same file MAY go to different groups when they serve different concerns.
- "name" is a short kebab-case slug (max 4 words).
- "commit" is a conventional commit message (type(scope): summary) for the group.
- "hunks" is an array of the INTEGER ids shown in brackets, e.g. [1, 4, 5].
Respond with ONLY a JSON array, ordered foundational-first, no markdown fences:
[{"name": "...", "responsibility": "one sentence", "commit": "...", "hunks": [1, 2]}]`;

export function buildBranchSplitPrompt(fileDiffs: FileDiff[]): string {
  const lines: string[] = [];
  let id = 1;
  for (const fd of fileDiffs) {
    lines.push(`### ${fd.status} ${fd.file}`);
    fd.hunks.forEach((h) => {
      const head = h.patch.split('\n')[0];
      lines.push(`  [${id}] (+${h.added} −${h.deleted}) ${head}`);
      id++;
    });
  }
  return `Changed hunks — each line is "[id] (+added −removed) hunk-header":\n${lines.join('\n')}\n\nGroup every hunk id into an ordered, dependency-first stack.`;
}
