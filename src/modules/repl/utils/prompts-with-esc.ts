import { select, input, confirm, checkbox, number } from '@inquirer/prompts';
import chalk from 'chalk';

export class CancelledPromptError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledPromptError';
  }
}

/**
 * Wrapper para prompts do @inquirer/prompts que adiciona suporte à tecla ESC
 * Pressionar ESC cancela o prompt e lança CancelledPromptError
 */
export async function selectWithEsc<T>(config: Parameters<typeof select<T>>[0]): Promise<T> {
  const abortController = new AbortController();
  
  // Escuta ESC em raw mode
  const handleKeypress = (chunk: Buffer) => {
    const str = chunk.toString();
    // ESC é \x1b ou \x1b\x1b em alguns terminais
    if (str === '\x1b' || str === '\x1b\x1b' || str === '\x03') {
      abortController.abort();
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on('data', handleKeypress);
  }

  try {
    const result = await select(config, { signal: abortController.signal });
    return result;
  } catch (error: any) {
    if (error.name === 'AbortPromptError' || abortController.signal.aborted) {
      throw new CancelledPromptError();
    }
    throw error;
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.removeListener('data', handleKeypress);
    }
  }
}

export async function inputWithEsc(config: Parameters<typeof input>[0]): Promise<string> {
  const abortController = new AbortController();
  
  const handleKeypress = (chunk: Buffer) => {
    const str = chunk.toString();
    if (str === '\x1b' || str === '\x1b\x1b' || str === '\x03') {
      abortController.abort();
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on('data', handleKeypress);
  }

  try {
    const result = await input(config, { signal: abortController.signal });
    return result;
  } catch (error: any) {
    if (error.name === 'AbortPromptError' || abortController.signal.aborted) {
      throw new CancelledPromptError();
    }
    throw error;
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.removeListener('data', handleKeypress);
    }
  }
}

export async function confirmWithEsc(config: Parameters<typeof confirm>[0]): Promise<boolean> {
  const abortController = new AbortController();
  
  const handleKeypress = (chunk: Buffer) => {
    const str = chunk.toString();
    if (str === '\x1b' || str === '\x1b\x1b' || str === '\x03') {
      abortController.abort();
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on('data', handleKeypress);
  }

  try {
    const result = await confirm(config, { signal: abortController.signal });
    return result;
  } catch (error: any) {
    if (error.name === 'AbortPromptError' || abortController.signal.aborted) {
      throw new CancelledPromptError();
    }
    throw error;
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.removeListener('data', handleKeypress);
    }
  }
}

export async function numberWithEsc(config: Parameters<typeof number>[0]): Promise<number> {
  const abortController = new AbortController();
  
  const handleKeypress = (chunk: Buffer) => {
    const str = chunk.toString();
    if (str === '\x1b' || str === '\x1b\x1b' || str === '\x03') {
      abortController.abort();
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on('data', handleKeypress);
  }

  try {
    const result = await number(config, { signal: abortController.signal });
    return result;
  } catch (error: any) {
    if (error.name === 'AbortPromptError' || abortController.signal.aborted) {
      throw new CancelledPromptError();
    }
    throw error;
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.removeListener('data', handleKeypress);
    }
  }
}

/**
 * Menu interativo com suporte a ESC
 * Retorna null se o usuário pressionar ESC
 */
export async function menuWithEsc<T extends string>(
  title: string,
  choices: { value: T; label: string; description?: string }[],
  options?: { showEscHint?: boolean }
): Promise<T | null> {
  if (options?.showEscHint !== false) {
    console.log(chalk.gray(`
(pressione ESC para voltar)
`));
  }

  try {
    const result = await selectWithEsc<T>({
      message: title,
      choices: choices.map(c => ({
        name: c.label + (c.description ? chalk.gray(` - ${c.description}`) : ''),
        value: c.value,
      })),
    });
    return result;
  } catch (CancelledPromptError) {
    return null;
  }
}

/**
 * Wrapper para múltiplas operações com tratamento de ESC
 * Se o usuário pressionar ESC em qualquer prompt, retorna null
 */
export async function withEsc<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof CancelledPromptError || error.name === 'CancelledPromptError') {
      return null;
    }
    throw error;
  }
}
