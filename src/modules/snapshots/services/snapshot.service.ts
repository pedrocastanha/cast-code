import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SNAPSHOTS_DIR = path.join(os.homedir(), '.cast', 'snapshots');
const MAX_SNAPSHOTS_PER_FILE = 5;

export interface SnapshotMeta {
  sessionId: string;
  filePath: string;
  timestamp: number;
  snapshotPath: string;
}

@Injectable()
export class SnapshotService {
  private sessionId: string;
  private meta: SnapshotMeta[] = [];

  constructor() {
    this.sessionId = Date.now().toString(36);
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    this.loadMeta();
  }

  /** Save a snapshot of a file before it is modified. Safe to call even if file doesn't exist. */
  saveSnapshot(filePath: string): void {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return;

    const sessionDir = path.join(SNAPSHOTS_DIR, this.sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Encode path as safe filename
    const snapshotName = absPath.replace(/[/\\:]/g, '__') + '.snap';
    const snapshotPath = path.join(sessionDir, snapshotName);

    fs.copyFileSync(absPath, snapshotPath);

    this.meta.push({
      sessionId: this.sessionId,
      filePath: absPath,
      timestamp: Date.now(),
      snapshotPath,
    });

    this.saveMeta();
    this.pruneOldSnapshots(absPath);
  }

  /** Restore a file to its most recent snapshot. Returns true on success. */
  rollback(filePath: string): boolean {
    const absPath = path.resolve(filePath);
    const snapshots = this.meta
      .filter(m => m.filePath === absPath)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (snapshots.length === 0) return false;

    const latest = snapshots[0];
    if (!fs.existsSync(latest.snapshotPath)) return false;

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.copyFileSync(latest.snapshotPath, absPath);
    return true;
  }

  /** List snapshots, optionally filtered by file */
  listSnapshots(filePath?: string): SnapshotMeta[] {
    if (filePath) {
      const absPath = path.resolve(filePath);
      return this.meta
        .filter(m => m.filePath === absPath)
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    // Return unique files (most recent snapshot per file)
    const seen = new Map<string, SnapshotMeta>();
    this.meta.forEach(m => {
      const existing = seen.get(m.filePath);
      if (!existing || m.timestamp > existing.timestamp) seen.set(m.filePath, m);
    });
    return Array.from(seen.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getCurrentSessionId(): string {
    return this.sessionId;
  }

  private pruneOldSnapshots(filePath: string): void {
    const snapshots = this.meta
      .filter(m => m.filePath === filePath)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
      const toDelete = snapshots.slice(MAX_SNAPSHOTS_PER_FILE);
      toDelete.forEach(s => {
        try { if (fs.existsSync(s.snapshotPath)) fs.unlinkSync(s.snapshotPath); } catch {}
        this.meta = this.meta.filter(m => m.snapshotPath !== s.snapshotPath);
      });
      this.saveMeta();
    }
  }

  private loadMeta(): void {
    const metaPath = path.join(SNAPSHOTS_DIR, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        this.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        this.meta = [];
      }
    }
  }

  private saveMeta(): void {
    const metaPath = path.join(SNAPSHOTS_DIR, 'meta.json');
    try {
      fs.writeFileSync(metaPath, JSON.stringify(this.meta, null, 2));
    } catch {}
  }
}
