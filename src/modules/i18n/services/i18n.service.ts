import { Injectable } from '@nestjs/common';
import { en, LocaleKeys } from '../locales/en';
import { pt } from '../locales/pt';

@Injectable()
export class I18nService {
  private locale: typeof en = en;
  private language: 'en' | 'pt' = 'en';

  /** Called by ConfigManagerService or config command after language is set */
  setLanguage(lang: 'en' | 'pt'): void {
    this.language = lang;
    this.locale = lang === 'pt' ? pt : en;
  }

  getLanguage(): 'en' | 'pt' {
    return this.language;
  }

  /** Translate a key, replacing %s/%d with args in order */
  t(key: LocaleKeys, ...args: (string | number)[]): string {
    let text = this.locale[key] as string;
    args.forEach(arg => {
      text = text.replace('%s', String(arg)).replace('%d', String(arg));
    });
    return text;
  }

  /** Returns the language instruction to embed in the agent system prompt */
  getAgentLanguageInstruction(): string {
    if (this.language === 'pt') {
      return 'IMPORTANT: Always respond in Brazilian Portuguese (pt-BR). All explanations, commit messages, tool output summaries, and user-facing text must be in Portuguese.';
    }
    return 'Always respond in English.';
  }
}
