import { Injectable } from '@nestjs/common';
import { Colors, Icons } from '../../modules/repl/utils/theme';

interface RenderOptions {
  maxWidth?: number;
  codeTheme?: 'dark' | 'light';
}

@Injectable()
export class MarkdownRendererService {
  private maxWidth = 80;

  render(markdown: string, options: RenderOptions = {}): string {
    this.maxWidth = options.maxWidth || process.stdout.columns || 80;
    
    let text = markdown;
    
    // Headers (process before other elements)
    text = this.renderHeaders(text);
    
    // Code blocks
    text = this.renderCodeBlocks(text);
    
    // Inline code
    text = this.renderInlineCode(text);
    
    // Bold
    text = this.renderBold(text);
    
    // Italic
    text = this.renderItalic(text);
    
    // Blockquotes
    text = this.renderBlockquotes(text);
    
    // Lists
    text = this.renderLists(text);
    
    // Horizontal rules
    text = this.renderHorizontalRules(text);
    
    // Links
    text = this.renderLinks(text);
    
    // Tables
    text = this.renderTables(text);
    
    return text;
  }

  private renderHeaders(text: string): string {
    // H1: # Title
    text = text.replace(/^# (.+)$/gm, (match, content) => {
      return `\n${Colors.cyan}${Colors.bold}${'─'.repeat(this.maxWidth)}${Colors.reset}\n${Colors.cyan}${Colors.bold}${this.center(content.trim(), this.maxWidth)}${Colors.reset}\n${Colors.cyan}${Colors.bold}${'─'.repeat(this.maxWidth)}${Colors.reset}\n`;
    });
    
    // H2: ## Title
    text = text.replace(/^## (.+)$/gm, (match, content) => {
      return `\n${Colors.cyan}${Colors.bold}${content.trim()}${Colors.reset}\n${Colors.dim}${'─'.repeat(content.trim().length)}${Colors.reset}\n`;
    });
    
    // H3: ### Title
    text = text.replace(/^### (.+)$/gm, (match, content) => {
      return `\n${Colors.cyan}${Colors.bold}${Icons.arrow} ${content.trim()}${Colors.reset}\n`;
    });
    
    // H4-H6: #### Title
    text = text.replace(/^####+ (.+)$/gm, (match, content) => {
      return `\n${Colors.bold}${content.trim()}${Colors.reset}\n`;
    });
    
    return text;
  }

  private renderCodeBlocks(text: string): string {
    return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const lines = code.trim().split('\n');
      const maxLineLength = Math.max(...lines.map(l => l.length), 20);
      const width = Math.min(maxLineLength + 2, this.maxWidth - 4);
      
      let result = `\n${Colors.gray}${'┌' + '─'.repeat(width) + (lang ? ` ${lang} ` : '') + '─'.repeat(Math.max(0, width - (lang?.length || 0) - 2))}${Colors.reset}\n`;
      
      for (const line of lines.slice(0, 20)) {
        const truncated = line.length > width ? line.slice(0, width - 3) + '...' : line;
        result += `${Colors.gray}│${Colors.reset} ${Colors.dim}${truncated}${' '.repeat(Math.max(0, width - truncated.length - 1))}${Colors.gray}│${Colors.reset}\n`;
      }
      
      if (lines.length > 20) {
        result += `${Colors.gray}│${Colors.reset} ${Colors.dim}... (${lines.length - 20} more lines)${' '.repeat(Math.max(0, width - 25))}${Colors.gray}│${Colors.reset}\n`;
      }
      
      result += `${Colors.gray}${'└' + '─'.repeat(width + 1)}${Colors.reset}\n`;
      return result;
    });
  }

  private renderInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (match, code) => {
      return `${Colors.gray}░${Colors.reset}${Colors.dim}${code.trim()}${Colors.reset}${Colors.gray}░${Colors.reset}`;
    });
  }

  private renderBold(text: string): string {
    // **text** or __text__
    return text.replace(/(\*\*|__)(.+?)\1/g, (match, markers, content) => {
      return `${Colors.bold}${Colors.white}${content.trim()}${Colors.reset}`;
    });
  }

  private renderItalic(text: string): string {
    // *text* or _text_ (but not **)
    return text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (match, content) => {
      return `${Colors.italic}${content.trim()}${Colors.reset}`;
    });
  }

  private renderBlockquotes(text: string): string {
    return text.replace(/^> (.+)$/gm, (match, content) => {
      return `${Colors.blue}┃${Colors.reset} ${Colors.dim}${content.trim()}${Colors.reset}`;
    });
  }

  private renderLists(text: string): string {
    // Unordered lists
    text = text.replace(/^(\s*)[-*] (.+)$/gm, (match, indent, content) => {
      const level = indent.length / 2;
      const bullet = level === 0 ? Icons.bullet : '  ' + Icons.bullet;
      return `${Colors.cyan}${bullet}${Colors.reset} ${content.trim()}`;
    });
    
    // Ordered lists
    text = text.replace(/^(\s*)(\d+)\. (.+)$/gm, (match, indent, num, content) => {
      return `${Colors.cyan}${num}.${Colors.reset} ${content.trim()}`;
    });
    
    return text;
  }

  private renderHorizontalRules(text: string): string {
    return text.replace(/^(---+|===+|___+|\*\*\*+)$/gm, () => {
      return `${Colors.dim}${'─'.repeat(this.maxWidth)}${Colors.reset}`;
    });
  }

  private renderLinks(text: string): string {
    // [text](url)
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      return `${Colors.underline}${Colors.blue}${label.trim()}${Colors.reset} ${Colors.dim}(${url})${Colors.reset}`;
    });
  }

  private renderTables(text: string): string {
    // Simple table rendering
    const tableRegex = /\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g;
    
    return text.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').map((h: string) => h.trim()).filter(Boolean);
      const rows = bodyRows.trim().split('\n').map((row: string) => 
        row.split('|').map((c: string) => c.trim()).filter(Boolean)
      );
      
      if (headers.length === 0) return match;
      
      const colWidth = Math.floor((this.maxWidth - 10) / headers.length);
      
      let result = '\n';
      
      // Header
      result += `${Colors.cyan}┌${'─'.repeat(colWidth + 2)}┬${('─'.repeat(colWidth + 2) + '┬').repeat(headers.length - 1)}┐${Colors.reset}\n`;
      result += `${Colors.cyan}│${Colors.reset}`;
      for (const h of headers) {
        const padded = this.truncate(h, colWidth).padEnd(colWidth);
        result += ` ${Colors.bold}${padded}${Colors.reset} ${Colors.cyan}│${Colors.reset}`;
      }
      result += '\n';
      
      // Separator
      result += `${Colors.cyan}├${'─'.repeat(colWidth + 2)}┼${('─'.repeat(colWidth + 2) + '┼').repeat(headers.length - 1)}┤${Colors.reset}\n`;
      
      // Rows
      for (const row of rows.slice(0, 10)) {
        result += `${Colors.cyan}│${Colors.reset}`;
        for (let i = 0; i < headers.length; i++) {
          const cell = row[i] || '';
          const padded = this.truncate(cell, colWidth).padEnd(colWidth);
          result += ` ${Colors.dim}${padded}${Colors.reset} ${Colors.cyan}│${Colors.reset}`;
        }
        result += '\n';
      }
      
      // Footer
      result += `${Colors.cyan}└${'─'.repeat(colWidth + 2)}┴${('─'.repeat(colWidth + 2) + '┴').repeat(headers.length - 1)}┘${Colors.reset}\n`;
      
      return result;
    });
  }

  private center(text: string, width: number): string {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  // Helper to create a box around content
  createBox(content: string, title?: string): string {
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map(l => l.replace(/\x1b\[\d+m/g, '').length), 20);
    const width = Math.min(maxLength + 4, this.maxWidth);
    
    let result = '';
    
    // Top border
    if (title) {
      const titleLen = title.length;
      const leftPad = Math.floor((width - titleLen - 2) / 2);
      const rightPad = width - titleLen - 2 - leftPad;
      result += `${Colors.cyan}╭${'─'.repeat(leftPad)} ${title} ${'─'.repeat(rightPad)}╮${Colors.reset}\n`;
    } else {
      result += `${Colors.cyan}╭${'─'.repeat(width)}╮${Colors.reset}\n`;
    }
    
    // Content
    for (const line of lines) {
      const visibleLen = line.replace(/\x1b\[\d+m/g, '').length;
      const padding = Math.max(0, width - 2 - visibleLen);
      result += `${Colors.cyan}│${Colors.reset} ${line}${' '.repeat(padding)} ${Colors.cyan}│${Colors.reset}\n`;
    }
    
    // Bottom border
    result += `${Colors.cyan}╰${'─'.repeat(width)}╯${Colors.reset}\n`;
    
    return result;
  }

  // Helper to create a section with header
  createSection(title: string, content: string): string {
    return `\n${Colors.cyan}${Colors.bold}${Icons.arrow} ${title}${Colors.reset}\n${Colors.dim}${'─'.repeat(title.length + 4)}${Colors.reset}\n${content}\n`;
  }

  // Helper to format tool usage
  formatToolCall(toolName: string, input: Record<string, any>): string {
    const inputStr = Object.entries(input)
      .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 50)}`)
      .join(', ');
    
    return `${Colors.dim}  ${Colors.cyan}⎿${Colors.reset}${Colors.dim} ${toolName} ${inputStr}${Colors.reset}`;
  }

  // Helper to format tool result
  formatToolResult(output: string, maxLines = 5): string {
    const lines = output.split('\n');
    const preview = lines.slice(0, maxLines).map(l => `    ${Colors.dim}${l.slice(0, 100)}${Colors.reset}`).join('\n');
    const more = lines.length > maxLines ? `\n    ${Colors.dim}... (${lines.length - maxLines} more lines)${Colors.reset}` : '';
    return preview + more;
  }
}
