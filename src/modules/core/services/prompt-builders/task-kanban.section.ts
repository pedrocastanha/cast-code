import { PromptSection, PromptBuilderContext } from './types';

export class TaskKanbanSection implements PromptSection {
  id = 'task-kanban';

  build(): string {
    return [
      '# Task Management & Kanban Board',
      'You are integrated with a live Kanban Board. The board is the source of truth for the user to see your progress.',
      '- **CRITICAL**: Whenever you start working on a task, you MUST call **task_update** with status="in_progress".',
      '- **CRITICAL**: When a task is implemented and ready for human validation, you MUST call **task_update** with status="test".',
      '- Use **task_create** to break complex work into trackable subtasks. They will appear on the board instantly.',
      '- Use **task_list** to see what\'s on your plate.',
      '- Use **ask_user_question** when you need clarification BEFORE acting.',
      '',
      '## Memory',
      '- Use **memory_write** to save important learnings and project insights',
      '- Use **memory_read** to recall previously saved notes',
      '- Memory persists across sessions — use it to avoid repeating mistakes',
      '',
    ].join('\n');
  }
}
