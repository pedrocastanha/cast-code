import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'node:child_process';

const getSnapshotsDir = () => process.env.CAST_SNAPSHOTS_DIR || path.join(os.homedir(), '.cast', 'snapshots');
const MAX_SNAPSHOTS_PER_FILE = 5;
const SNAPSHOT_IGNORED_PROJECT_DIRS = new Set(['.git', '.cast', 'node_modules', 'dist', 'coverage', '.next']);
const CLEANUP_IGNORED_PROJECT_DIRS = new Set(['.git', '.cast', 'node_modules']);

export interface SnapshotMeta {
  sessionId: string;
  filePath: string;
  timestamp: number;
  snapshotPath: string;
  checkpointId?: string;
  projectRoot?: string;
}

export interface SnapshotCheckpoint {
  checkpointId: string;
  projectRoot?: string;
  timestamp: number;
  files: SnapshotMeta[];
  manifest?: string[];
}

@Injectable()
export class SnapshotService {
  private sessionId: string;
  private meta: SnapshotMeta[] = [];

  constructor() {
    this.sessionId = Date.now().toString(36);
    fs.mkdirSync(this.snapshotsDir(), { recursive: true, mode: 0o700 });
    this.loadMeta();
  }

  /** Save a snapshot of a file before it is modified. Safe to call even if file doesn't exist. */
  saveSnapshot(filePath: string, checkpointId?: string, projectRoot?: string): void {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return;

    const sessionDir = path.join(this.snapshotsDir(), this.sessionId, checkpointId ?? 'manual');
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    // Encode path as safe filename
    const snapshotName = absPath.replace(/[/\\:]/g, '__') + '.snap';
    const snapshotPath = path.join(sessionDir, snapshotName);

    fs.copyFileSync(absPath, snapshotPath);
    this.chmodFile(snapshotPath);

    this.meta.push({
      sessionId: this.sessionId,
      filePath: absPath,
      timestamp: Date.now(),
      snapshotPath,
      checkpointId,
      projectRoot: projectRoot ? path.resolve(projectRoot) : undefined,
    });

    this.saveMeta();
    this.pruneOldSnapshots(absPath);
  }

  saveCheckpoint(projectRoot: string, checkpointId: string): SnapshotCheckpoint {
    const root = path.resolve(projectRoot);
    const files = this.listProjectFiles(root);
    const manifest = Array.from(new Set(files.map((filePath) => path.resolve(filePath)))).sort();
    const cleanupManifest = Array.from(new Set(this.walkProjectFiles(root, CLEANUP_IGNORED_PROJECT_DIRS)
      .map((filePath) => path.resolve(filePath)))).sort();
    for (const filePath of files) {
      this.saveSnapshot(filePath, checkpointId, root);
    }
    this.saveCheckpointManifest(checkpointId, root, manifest, cleanupManifest);
    return {
      checkpointId,
      projectRoot: root,
      timestamp: Date.now(),
      files: this.meta.filter((item) => item.checkpointId === checkpointId),
      manifest,
    };
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

  rollbackCheckpoint(checkpointId: string): boolean {
    const snapshots = this.meta
      .filter((item) => item.checkpointId === checkpointId)
      .sort((a, b) => b.timestamp - a.timestamp);
    if (snapshots.length === 0) {
      return false;
    }

    this.removeFilesCreatedAfterCheckpoint(checkpointId);

    const latestByFile = new Map<string, SnapshotMeta>();
    for (const snapshot of snapshots) {
      if (!latestByFile.has(snapshot.filePath)) {
        latestByFile.set(snapshot.filePath, snapshot);
      }
    }

    let restored = false;
    for (const snapshot of latestByFile.values()) {
      if (!fs.existsSync(snapshot.snapshotPath)) {
        continue;
      }
      fs.mkdirSync(path.dirname(snapshot.filePath), { recursive: true });
      fs.copyFileSync(snapshot.snapshotPath, snapshot.filePath);
      restored = true;
    }
    return restored;
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

  listCheckpoints(): SnapshotCheckpoint[] {
    const byId = new Map<string, SnapshotMeta[]>();
    for (const snapshot of this.meta.filter((item) => item.checkpointId)) {
      const list = byId.get(snapshot.checkpointId!) ?? [];
      list.push(snapshot);
      byId.set(snapshot.checkpointId!, list);
    }
    return Array.from(byId.entries()).map(([checkpointId, files]) => ({
      checkpointId,
      projectRoot: files[0]?.projectRoot,
      timestamp: Math.max(...files.map((item) => item.timestamp)),
      files,
      manifest: this.loadCheckpointManifest(checkpointId)?.files,
    })).sort((a, b) => b.timestamp - a.timestamp);
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
    const metaPath = path.join(this.snapshotsDir(), 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        this.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        this.meta = [];
      }
    }
  }

  private saveMeta(): void {
    const metaPath = path.join(this.snapshotsDir(), 'meta.json');
    try {
      fs.writeFileSync(metaPath, JSON.stringify(this.meta, null, 2), { mode: 0o600 });
      this.chmodFile(metaPath);
    } catch {}
  }

  private checkpointManifestPath(checkpointId: string): string {
    const safeName = checkpointId.replace(/[^a-zA-Z0-9_.-]/g, '-');
    return path.join(this.snapshotsDir(), 'checkpoints', `${safeName}.json`);
  }

  private saveCheckpointManifest(checkpointId: string, projectRoot: string, files: string[], cleanupFiles: string[]): void {
    const manifestPath = this.checkpointManifestPath(checkpointId);
    try {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(manifestPath, JSON.stringify({ checkpointId, projectRoot, files, cleanupFiles }, null, 2), { mode: 0o600 });
      this.chmodFile(manifestPath);
    } catch {}
  }

  private loadCheckpointManifest(checkpointId: string): { checkpointId: string; projectRoot: string; files: string[]; cleanupFiles: string[] } | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.checkpointManifestPath(checkpointId), 'utf8'));
      if (!Array.isArray(parsed.files) || typeof parsed.projectRoot !== 'string') {
        return null;
      }
      const files = parsed.files.map((filePath: string) => path.resolve(filePath));
      const cleanupFiles = Array.isArray(parsed.cleanupFiles)
        ? parsed.cleanupFiles.map((filePath: string) => path.resolve(filePath))
        : files;
      return {
        checkpointId,
        projectRoot: path.resolve(parsed.projectRoot),
        files,
        cleanupFiles,
      };
    } catch {
      return null;
    }
  }

  private removeFilesCreatedAfterCheckpoint(checkpointId: string): void {
    const manifest = this.loadCheckpointManifest(checkpointId);
    if (!manifest) {
      return;
    }
    const knownFiles = new Set(manifest.cleanupFiles);
    const currentFiles = this.walkProjectFiles(manifest.projectRoot, CLEANUP_IGNORED_PROJECT_DIRS);
    for (const filePath of currentFiles) {
      const resolved = path.resolve(filePath);
      if (knownFiles.has(resolved) || !this.isInsideOrEqual(resolved, manifest.projectRoot)) {
        continue;
      }
      try {
        fs.unlinkSync(resolved);
      } catch {}
    }
  }

  private listProjectFiles(projectRoot: string): string[] {
    const gitFiles = this.listGitFiles(projectRoot);
    if (gitFiles.length > 0) {
      return gitFiles;
    }
    return this.walkProjectFiles(projectRoot);
  }

  private snapshotsDir(): string {
    return getSnapshotsDir();
  }

  private listGitFiles(projectRoot: string): string[] {
    try {
      const output = execFileSync('git', ['-C', projectRoot, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) as string;
      return output.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((filePath) => path.join(projectRoot, filePath))
        .filter((filePath) => this.shouldSnapshotProjectFile(projectRoot, filePath));
    } catch {
      return [];
    }
  }

  private walkProjectFiles(projectRoot: string, ignoredDirs: Set<string> = SNAPSHOT_IGNORED_PROJECT_DIRS): string[] {
    const results: string[] = [];
    const snapshotRoot = path.resolve(this.snapshotsDir());
    const walk = (directory: string) => {
      if (this.isInsideOrEqual(directory, snapshotRoot)) {
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (ignoredDirs.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (this.isInsideOrEqual(fullPath, snapshotRoot)) continue;
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
    };
    walk(projectRoot);
    return results.slice(0, 2000);
  }

  private shouldSnapshotProjectFile(projectRoot: string, filePath: string): boolean {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return false;
    }
    const resolved = path.resolve(filePath);
    if (this.isInsideOrEqual(resolved, path.resolve(this.snapshotsDir()))) {
      return false;
    }
    const relative = path.relative(projectRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return false;
    }
    return !relative.split(path.sep).some((part) => SNAPSHOT_IGNORED_PROJECT_DIRS.has(part));
  }

  private isInsideOrEqual(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private chmodFile(filePath: string): void {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {}
  }
}
