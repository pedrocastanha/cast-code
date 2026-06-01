import { Injectable } from '@nestjs/common';
import { StatsService } from '../../../stats/services/stats.service';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';

@Injectable()
export class StatsCommandsService {
  private readonly ui = new CommandUiService();

  constructor(private readonly statsService: StatsService) {}

  setDefaultModel(model: string): void {
    this.statsService.setDefaultModel(model);
  }

  getSessionCostLabel(): string {
    const session = this.statsService.getSessionStats();
    return `$${session.estimatedCostUsd.toFixed(2)}`;
  }

  cmdStats(): void {
    const session = this.statsService.getSessionStats();
    const today = this.statsService.getTodayStats();
    const allTime = this.statsService.getAllTimeStats();

    const cost = (amount: number, decimals: number) => colorize(
      amount === 0 ? 'free' : `$${amount.toFixed(decimals)}`,
      amount === 0 ? 'muted' : 'success',
    );

    process.stdout.write(this.ui.panel({
      title: 'Stats',
      subtitle: 'tokens and cost',
      sections: [
        {
          title: 'This session',
          rows: [
            { label: 'Model', value: colorize(session.model || 'unknown', 'cyan') },
            { label: 'Tokens', value: colorize(session.totalTokens.toLocaleString(), 'accent') },
            { label: 'Cost', value: cost(session.estimatedCostUsd, 5) },
            { label: 'Messages', value: colorize(session.messageCount.toString(), 'text') },
          ],
        },
        {
          title: 'Today',
          rows: [
            { label: 'Tokens', value: colorize(today.tokens.toLocaleString(), 'accent') },
            { label: 'Cost', value: cost(today.cost, 5) },
          ],
        },
        {
          title: 'All time',
          rows: [
            { label: 'Tokens', value: colorize(allTime.tokens.toLocaleString(), 'accent') },
            { label: 'Cost', value: cost(allTime.cost, 4) },
            { label: 'Sessions', value: colorize(allTime.sessions.toString(), 'text') },
          ],
        },
      ],
    }));
  }
}
