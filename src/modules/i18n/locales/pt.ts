import { en, LocaleKeys } from './en';

export const pt: Record<LocaleKeys, string> = {
  agentThinking: 'Pensando...',
  agentReading: 'Lendo...',
  agentWriting: 'Escrevendo...',
  agentEditing: 'Editando...',
  agentRunning: 'Executando...',
  agentSearching: 'Buscando...',
  agentWorking: 'Trabalhando...',

  cancelled: 'Cancelado.',
  interrupted: 'Interrompido.',
  noChanges: 'Nenhuma mudança para commitar.',
  unknownCommand: 'Comando desconhecido: %s  Execute /help para referência.',
  nothingToCommit: 'Nada para commitar.',

  commitSuccess: 'Commit realizado: %s',
  commitError: 'Commit falhou: %s',
  pushFailed: 'Push falhou: %s',
  pushSkipped: 'Push cancelado.',
  rollbackAvailable: 'Rollback disponível:',
  commitsCreated: 'Commits criados:',
  diffCouldNotRetrieve: 'Não foi possível obter o diff, usando mensagem original.',

  kanbanStarted: 'Kanban board → http://localhost:%d',

  configLanguage: 'Idioma',
  configLanguagePrompt: 'Selecione o idioma',
  configEnglish: 'English',
  configPortuguese: 'Português',
  configSaved: 'Configuração salva.',

  statsHeader: 'Estatísticas da Sessão',
  statsSession: 'Esta sessão',
  statsToday: 'Hoje',
  statsAllTime: 'Total geral',
  statsFree: 'grátis',

  snapshotSaved: 'Snapshot salvo.',
  snapshotRestored: 'Restaurado: %s',
  snapshotNone: 'Nenhum snapshot para este arquivo.',
  snapshotNoSession: 'Nenhum snapshot nesta sessão.',
  rollbackUsage: 'Execute /rollback <arquivo> para restaurar.',

  diffPreviewHeader: 'Preview das mudanças',
  diffPreviewApprove: 'Aplicar essas mudanças?',
  diffPreviewApproved: 'Mudanças aplicadas.',
  diffPreviewRejected: 'Mudanças rejeitadas.',
  diffPreviewLarge: '%d linhas alteradas',

  watchStarted: 'Monitorando %s por mudanças.',
  watchContextUpdated: '⟳ contexto sincronizado',
  watchStopped: 'Monitor de arquivos parado.',

  replaySaved: 'Sessão salva como "%s".',
  replayList: 'Sessões salvas',
  replayNone: 'Nenhuma sessão salva.',
  replayNotFound: 'Sessão "%s" não encontrada.',
  replayUsage: 'Uso: /replay [save <nome>] [list] [show <nome>]',

  vaultSaved: 'Snippet "%s" salvo.',
  vaultList: 'Cofre de snippets',
  vaultEmpty: 'Cofre vazio.',
  vaultPromoted: 'Snippet "%s" promovido para skill.',
  vaultNotFound: 'Snippet "%s" não encontrado.',
  vaultUsage: 'Uso: /vault [list] [show <nome>] [promote <nome>]',

  impactLow: '✓ Baixo impacto — poucos dependentes.',
  impactHigh: '⚠️  Mudanças neste arquivo afetarão %d arquivo(s) dependente(s). Revise com cuidado.',
};
