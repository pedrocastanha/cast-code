import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import { VaultService } from '../../../vault/services/vault.service';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';

const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.cast', 'skills');

@Injectable()
export class VaultCommandsService {
  private readonly ui = new CommandUiService();

  constructor(private readonly vaultService: VaultService) {}

  cmdVault(args: string): void {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const name = parts.slice(1).join(' ');

    switch (sub) {
    case 'show':
      if (!name) { process.stdout.write(this.ui.error('Usage: /vault show <name>')); return; }
      this.showSnippet(name);
      break;

    case 'promote':
      if (!name) { process.stdout.write(this.ui.error('Usage: /vault promote <name>')); return; }
      this.promoteSnippet(name);
      break;

    case 'delete': {
      if (!name) { process.stdout.write(this.ui.error('Usage: /vault delete <name>')); return; }
      const deleted = this.vaultService.deleteSnippet(name);
      if (deleted) process.stdout.write(this.ui.success(`Snippet "${name}" deleted.`));
      else process.stdout.write(this.ui.error(`Snippet "${name}" not found.`));
      break;
    }

    case 'list':
    case '':
    case undefined:
      this.listSnippets();
      break;

    default:
      process.stdout.write(this.ui.error('Usage: /vault [list] [show <name>] [promote <name>] [delete <name>]'));
    }
  }

  private listSnippets(): void {
    const snippets = this.vaultService.listSnippets();
    process.stdout.write(this.ui.panel({
      title: 'Snippet Vault',
      subtitle: `${snippets.length} saved`,
      sections: [
        {
          lines: snippets.length === 0
            ? [colorize('No snippets yet. Ask Cast to save useful code to the vault.', 'muted')]
            : snippets.map((s) => `${colorize(s.name, 'cyan')}  ${colorize(s.language, 'muted')}  ${s.description}`),
        },
      ],
      footer: 'Use /vault show <name>, /vault promote <name>, or /vault delete <name>.',
    }));
  }

  private showSnippet(name: string): void {
    const snippet = this.vaultService.getSnippet(name);
    if (!snippet) {
      process.stdout.write(this.ui.error(`Snippet "${name}" not found.`));
      return;
    }
    process.stdout.write(this.ui.panel({
      title: 'Snippet',
      subtitle: snippet.name,
      sections: [
        {
          rows: [
            { label: 'Description', value: snippet.description },
            { label: 'Language', value: snippet.language },
            ...(snippet.tags.length > 0 ? [{ label: 'Tags', value: snippet.tags.join(', ') }] : []),
          ],
        },
      ],
      footer: 'Use /vault promote <name> to convert to skill.',
    }));
    process.stdout.write(`\r\n${colorize('```' + snippet.language, 'muted')}\r\n${snippet.code}\r\n${colorize('```', 'muted')}\r\n`);
  }

  private promoteSnippet(name: string): void {
    const promoted = this.vaultService.promoteToSkill(name, DEFAULT_SKILLS_DIR);
    if (promoted) {
      process.stdout.write(this.ui.success(`Snippet "${name}" promoted to skill. Saved to ${DEFAULT_SKILLS_DIR}/${name}.md`));
    } else {
      process.stdout.write(this.ui.error(`Snippet "${name}" not found.`));
    }
  }
}
