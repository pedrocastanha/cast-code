import { Injectable } from '@nestjs/common';
import { StatsService } from '../../../stats/services/stats.service';
import { colorize, UI } from '../../utils/theme';

@Injectable()
export class StatsCommandsService {
  constructor(private readonly statsService: StatsService) {}

  setDefaultModel(model: string): void {
    this.statsService.setDefaultModel(model);
  }

  cmdStats(): void {
    const session = this.statsService.getSessionStats();
    const today = this.statsService.getTodayStats();
    const allTime = this.statsService.getAllTimeStats();

    console.log(UI.header('Stats', '📊'));

    console.log('\n' + colorize('This session', 'muted'));
    console.log(UI.kv('Model', colorize(session.model || 'unknown', 'cyan'), 12));
    console.log(UI.kv('Tokens', colorize(session.totalTokens.toLocaleString(), 'accent'), 12));
    console.log(UI.kv('Cost', colorize(
      session.estimatedCostUsd === 0 ? 'free' : `$${session.estimatedCostUsd.toFixed(5)}`,
      session.estimatedCostUsd === 0 ? 'muted' : 'success',
    ), 12));
    console.log(UI.kv('Messages', colorize(session.messageCount.toString(), 'text'), 12));

    console.log('\n' + colorize('Today', 'muted'));
    console.log(UI.kv('Tokens', colorize(today.tokens.toLocaleString(), 'accent'), 12));
    console.log(UI.kv('Cost', colorize(
      today.cost === 0 ? 'free' : `$${today.cost.toFixed(5)}`,
      today.cost === 0 ? 'muted' : 'success',
    ), 12));

    console.log('\n' + colorize('All time', 'muted'));
    console.log(UI.kv('Tokens', colorize(allTime.tokens.toLocaleString(), 'accent'), 12));
    console.log(UI.kv('Cost', colorize(
      allTime.cost === 0 ? 'free' : `$${allTime.cost.toFixed(4)}`,
      allTime.cost === 0 ? 'muted' : 'success',
    ), 12));
    console.log(UI.kv('Sessions', colorize(allTime.sessions.toString(), 'text'), 12));
    console.log('');
  }
}
