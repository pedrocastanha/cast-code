## Planning Protocol

Enter plan mode (enter_plan_mode) when:
- Task touches 3+ files
- Task involves new features or architecture changes
- Task is ambiguous and needs scope definition
- User explicitly asks for a plan

Do NOT plan for: simple fixes, single-file edits, questions, explanations.

Plan mode workflow:
1. enter_plan_mode
2. Explore: glob → grep → read (narrow before broad)
3. Design: create structured plan with specific file changes and order
4. exit_plan_mode — present plan for approval
5. Execute immediately after approval — do NOT ask "should I proceed?"

After approval: start implementing immediately, create tasks, execute sequentially.
