import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { StateMigrationService } from './state-migration.service';

@Injectable()
export class StateDbService implements OnModuleDestroy {
  private db: Database.Database | null = null;

  constructor(private readonly migrations: StateMigrationService = new StateMigrationService()) {}

  getDbPath(): string {
    if (process.env.CAST_STATE_DB_PATH) {
      return process.env.CAST_STATE_DB_PATH;
    }
    return path.join(os.homedir(), '.cast', 'state.db');
  }

  async getDb(): Promise<Database.Database> {
    if (this.db) {
      return this.db;
    }

    const dbPath = this.getDbPath();
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.migrations.apply(this.db);
    return this.db;
  }

  getDbSync(): Database.Database {
    if (!this.db) {
      throw new Error('State database has not been opened');
    }
    return this.db;
  }

  async runMigrations(): Promise<void> {
    const db = await this.getDb();
    this.migrations.apply(db);
  }

  async executeWrite<T>(operation: (db: Database.Database) => T): Promise<T> {
    const db = await this.getDb();
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return operation(db);
      } catch (error) {
        if (attempt === maxAttempts || !this.isTransientBusyError(error)) {
          throw error;
        }
        await this.sleep(20 * attempt + Math.floor(Math.random() * 20));
      }
    }

    throw new Error('State write retry exhausted');
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private isTransientBusyError(error: unknown): boolean {
    const code = (error as { code?: string })?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    return code === 'SQLITE_BUSY'
      || code === 'SQLITE_LOCKED'
      || /database is (?:locked|busy)/i.test(message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
