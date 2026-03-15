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
3. Design: create structured plan with specific file changes and dependencies
4. Identify which steps are INDEPENDENT and can run in parallel via sub-agents
5. exit_plan_mode — present plan for approval
6. Execute immediately after approval — do NOT ask "should I proceed?"

After approval:
- Start implementing immediately.
- Dispatch sub-agents in parallel for independent tasks (e.g. creating different modules simultaneously).
- Only run sequentially when step B truly depends on step A's output.
- Track progress with write_todos and update as each step completes.
- Verify the full implementation compiles and runs before declaring done.
