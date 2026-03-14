import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import { VaultService } from '../../../vault/services/vault.service';
import { colorize, UI } from '../../utils/theme';

const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.cast', 'skills');

@Injectable()
export class VaultCommandsService {
  constructor(private readonly vaultService: VaultService) {}

  cmdVault(args: string): void {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const name = parts.slice(1).join(' ');

    switch (sub) {
      case 'show':
        if (!name) { console.log(UI.error('Usage: /vault show <name>')); return; }
        this.showSnippet(name);
        break;

      case 'promote':
        if (!name) { console.log(UI.error('Usage: /vault promote <name>')); return; }
        this.promoteSnippet(name);
        break;

      case 'delete':
        if (!name) { console.log(UI.error('Usage: /vault delete <name>')); return; }
        const deleted = this.vaultService.deleteSnippet(name);
        if (deleted) console.log(UI.success(`Snippet "${name}" deleted.`));
        else console.log(UI.error(`Snippet "${name}" not found.`));
        break;

      case 'list':
      case '':
      case undefined:
        this.listSnippets();
        break;

      default:
        console.log(UI.error('Usage: /vault [list] [show <name>] [promote <name>] [delete <name>]'));
    }
  }

  private listSnippets(): void {
    const snippets = this.vaultService.listSnippets();
    console.log(UI.header('Snippet Vault', '🗃'));
    console.log(colorize('  The vault stores reusable code snippets saved by the agent.', 'muted'));
    console.log(colorize('  Use /vault show <name> to view, /vault promote <name> to convert to a skill.\n', 'muted'));
    if (snippets.length === 0) {
      console.log(UI.warning('  No snippets yet. Ask the agent to save useful code to the vault.'));
      return;
    }
    snippets.forEach(s => {
      console.log(UI.item(
        `${colorize(s.name, 'cyan')}  ` +
        `${colorize(s.language, 'muted')}  ` +
        `${s.description}`
      ));
    });
    console.log(colorize('\nUse /vault show <name> to view code.', 'muted'));
  }

  private showSnippet(name: string): void {
    const snippet = this.vaultService.getSnippet(name);
    if (!snippet) {
      console.log(UI.error(`Snippet "${name}" not found.`));
      return;
    }
    console.log(UI.header(snippet.name, '🗃'));
    console.log(UI.kv('Description', snippet.description, 14));
    console.log(UI.kv('Language', snippet.language, 14));
    if (snippet.tags.length > 0) console.log(UI.kv('Tags', snippet.tags.join(', '), 14));
    console.log('');
    console.log(colorize('```' + snippet.language, 'muted'));
    console.log(snippet.code);
    console.log(colorize('```', 'muted'));
    console.log(colorize('\nUse /vault promote <name> to convert to skill.', 'muted'));
  }

  private promoteSnippet(name: string): void {
    const promoted = this.vaultService.promoteToSkill(name, DEFAULT_SKILLS_DIR);
    if (promoted) {
      console.log(UI.success(`Snippet "${name}" promoted to skill.`));
      console.log(colorize(`Saved to: ${DEFAULT_SKILLS_DIR}/${name}.md`, 'muted'));
    } else {
      console.log(UI.error(`Snippet "${name}" not found.`));
    }
  }
}
