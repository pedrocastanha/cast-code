export const KITTY_ENABLE = '\x1b[>1u';
export const KITTY_DISABLE = '\x1b[<u';

export interface KittyDetectOptions {
  stdin: NodeJS.ReadStream;
  write: (s: string) => void;
  timeoutMs?: number;
}

/**
 * Detects kitty keyboard protocol support. Sends a flags query followed by a
 * device-attributes query; a `CSI ? <flags> u` reply arriving before the
 * `CSI ? ... c` reply means the protocol is supported.
 */
export function detectKittyProtocol(options: KittyDetectOptions): Promise<boolean> {
  const { stdin, write, timeoutMs = 50 } = options;

  if (!stdin.isTTY) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let buffer = '';
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      stdin.removeListener('data', onData);
      clearTimeout(timer);
      resolve(result);
    };

    const onData = (data: Buffer | string) => {
      buffer += data.toString();
      if (/\x1b\[\?\d+u/.test(buffer)) {
        finish(true);
      } else if (/\x1b\[\?[\d;]*c/.test(buffer)) {
        finish(false);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    stdin.on('data', onData);
    write('\x1b[?u\x1b[c');
  });
}
