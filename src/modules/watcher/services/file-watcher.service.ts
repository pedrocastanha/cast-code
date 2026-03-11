import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export const FILE_CHANGE_EVENT = 'file:changed';

@Injectable()
export class FileWatcherService extends EventEmitter implements OnApplicationBootstrap, OnApplicationShutdown {
  private watcher: any | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changedFiles: Set<string> = new Set();
  private isActive = false;
  private autoWatchEnabled = true;

  onApplicationBootstrap(): void {
    if (this.autoWatchEnabled) {
      this.start();
    }
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  setAutoWatch(enabled: boolean): void {
    this.autoWatchEnabled = enabled;
    if (!enabled) this.stop();
    else if (!this.isActive) this.start();
  }

  start(): void {
    if (this.isActive) return;

    const watchPath = path.join(process.cwd(), 'src');
    if (!fs.existsSync(watchPath)) {
      // Try current directory as fallback
      this.startWatching(process.cwd());
      return;
    }
    this.startWatching(watchPath);
  }

  stop(): void {
    if (this.watcher) {
      try { this.watcher.close(); } catch {}
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isActive = false;
  }

  isRunning(): boolean {
    return this.isActive;
  }

  getWatchPath(): string {
    const srcPath = path.join(process.cwd(), 'src');
    return fs.existsSync(srcPath) ? srcPath : process.cwd();
  }

  private startWatching(watchPath: string): void {
    try {
      // Try to use chokidar if available, fall back to fs.watch
      let chokidar: any;
      try {
        chokidar = require('chokidar');
      } catch {
        chokidar = null;
      }

      if (chokidar) {
        this.watcher = chokidar.watch(watchPath, {
          ignored: /(node_modules|\.git|dist|\.superpowers)/,
          persistent: true,
          ignoreInitial: true,
          usePolling: false,
        });
        this.watcher.on('change', (fp: string) => this.onFileChanged(fp));
        this.watcher.on('add', (fp: string) => this.onFileChanged(fp));
        this.watcher.on('unlink', (fp: string) => this.onFileChanged(fp));
      } else {
        // Fallback: native fs.watch (recursive where supported)
        this.watcher = fs.watch(watchPath, { recursive: true }, (event, filename) => {
          if (filename) this.onFileChanged(path.join(watchPath, filename));
        });
      }

      this.isActive = true;
    } catch {
      // Silently fail — watching is a nice-to-have, not critical
      this.isActive = false;
    }
  }

  private onFileChanged(filePath: string): void {
    // Ignore non-source files
    if (/(node_modules|\.git|dist|\.superpowers|\.snap)/.test(filePath)) return;

    this.changedFiles.add(filePath);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const files = Array.from(this.changedFiles);
      this.changedFiles.clear();
      this.emit(FILE_CHANGE_EVENT, files);
    }, 2000);
  }
}
