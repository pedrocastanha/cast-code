export const en = {
  // Agent thinking phases
  agentThinking: 'Thinking...',
  agentReading: 'Reading...',
  agentWriting: 'Writing...',
  agentEditing: 'Editing...',
  agentRunning: 'Running...',
  agentSearching: 'Searching...',
  agentWorking: 'Working...',

  // Common UI
  cancelled: 'Cancelled.',
  interrupted: 'Interrupted.',
  noChanges: 'No changes to commit.',
  unknownCommand: 'Unknown command: %s  Run /help for reference.',
  nothingToCommit: 'Nothing to commit.',

  // Git
  commitSuccess: 'Committed: %s',
  commitError: 'Commit failed: %s',
  pushFailed: 'Push failed: %s',
  pushSkipped: 'Push skipped.',
  rollbackAvailable: 'Rollback available:',
  commitsCreated: 'Commits created:',
  diffCouldNotRetrieve: 'Could not retrieve diff, using original message.',

  // Kanban
  kanbanStarted: 'Kanban board → http://localhost:%d',

  // Config
  configLanguage: 'Language',
  configLanguagePrompt: 'Select language',
  configEnglish: 'English',
  configPortuguese: 'Português',
  configSaved: 'Configuration saved.',

  // Stats
  statsHeader: 'Session Stats',
  statsSession: 'This session',
  statsToday: 'Today',
  statsAllTime: 'All time',
  statsFree: 'free',

  // Snapshots
  snapshotSaved: 'Snapshot saved.',
  snapshotRestored: 'Restored: %s',
  snapshotNone: 'No snapshots for this file.',
  snapshotNoSession: 'No snapshots in current session.',
  rollbackUsage: 'Run /rollback <file> to restore a file.',

  // Diff preview
  diffPreviewHeader: 'Changes preview',
  diffPreviewApprove: 'Apply these changes?',
  diffPreviewApproved: 'Changes applied.',
  diffPreviewRejected: 'Changes rejected.',
  diffPreviewLarge: '%d lines changed',

  // Watch
  watchStarted: 'Watching %s for changes.',
  watchContextUpdated: '⟳ context synced',
  watchStopped: 'File watcher stopped.',

  // Replay
  replaySaved: 'Session saved as "%s".',
  replayList: 'Saved sessions',
  replayNone: 'No saved sessions.',
  replayNotFound: 'Session "%s" not found.',
  replayUsage: 'Usage: /replay [save <name>] [list] [show <name>]',

  // Vault
  vaultSaved: 'Snippet "%s" saved.',
  vaultList: 'Snippet vault',
  vaultEmpty: 'Vault is empty.',
  vaultPromoted: 'Snippet "%s" promoted to skill.',
  vaultNotFound: 'Snippet "%s" not found.',
  vaultUsage: 'Usage: /vault [list] [show <name>] [promote <name>]',

  // Impact analysis
  impactLow: '✓ Low impact — few dependents.',
  impactHigh: '⚠️  Changes to this file will affect %d dependent file(s). Review carefully.',
} as const;

export type LocaleKeys = keyof typeof en;
