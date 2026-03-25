
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import Database from 'better-sqlite3';
import { MemoryEntry, MemoryFilters, MemoryType } from '../types/ltm.types';

@Injectable()
export class LTMStorageService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database | null = null;
  private dbPath: string;
  private readonly DB_VERSION = 1;

  constructor() {
    const castDir = join(process.cwd(), '.cast');
    if (!existsSync(castDir)) {
      mkdirSync(castDir, { recursive: true });
    }
    this.dbPath = join(castDir, 'ltm.db');
  }

  onModuleInit() {
    this.initializeDatabase();
  }

  onModuleDestroy() {
    this.closeDatabase();
  }

  private initializeDatabase(): void {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma(`user_version = ${this.DB_VERSION}`);

      this.createTables();
    } catch (error) {
      console.error('[LTMStorageService] Failed to initialize database:', error);
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_instance ON memories(instance_id);
      CREATE INDEX IF NOT EXISTS idx_memories_room ON memories(room_id);
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `);
  }

  private closeDatabase(): void {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
      } catch (error) {
        console.error('[LTMStorageService] Error closing database:', error);
      }
    }
  }

    store(memory: MemoryEntry): void {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO memories (id, instance_id, room_id, agent_id, type, content, metadata, timestamp, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        memory.id,
        memory.instanceId,
        memory.roomId,
        memory.agentId,
        memory.type,
        memory.content,
        JSON.stringify(memory.metadata),
        memory.timestamp,
        memory.importance,
      );
    } catch (error) {
      console.error('[LTMStorageService] Failed to store memory:', error);
      throw error;
    }
  }

    search(query: string, filters: MemoryFilters): MemoryEntry[] {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      let sql = 'SELECT * FROM memories WHERE 1=1';
      const params: any[] = [];

      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        const typePlaceholders = types.map(() => '?').join(',');
        sql += ` AND type IN (${typePlaceholders})`;
        params.push(...types);
      }

      if (filters.agentId) {
        sql += ' AND agent_id = ?';
        params.push(filters.agentId);
      }

      if (filters.instanceId) {
        sql += ' AND instance_id = ?';
        params.push(filters.instanceId);
      }

      if (filters.roomId) {
        sql += ' AND room_id = ?';
        params.push(filters.roomId);
      }

      if (filters.startTime) {
        sql += ' AND timestamp >= ?';
        params.push(filters.startTime);
      }

      if (filters.endTime) {
        sql += ' AND timestamp <= ?';
        params.push(filters.endTime);
      }

      if (filters.minImportance !== undefined) {
        sql += ' AND importance >= ?';
        params.push(filters.minImportance);
      }

      if (filters.tags && filters.tags.length > 0) {
        sql += ' AND metadata LIKE ?';
        params.push(`%${filters.tags[0]}%`);
      }

      if (query) {
        sql += ' AND content LIKE ?';
        params.push(`%${query}%`);
      }

      sql += ' ORDER BY timestamp DESC';

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map((row) => this.rowToMemory(row));
    } catch (error) {
      console.error('[LTMStorageService] Search failed:', error);
      return [];
    }
  }

    getRelevant(context: string, limit: number = 10): MemoryEntry[] {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM memories
        ORDER BY importance DESC, timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(limit) as any[];
      return rows.map((row) => this.rowToMemory(row));
    } catch (error) {
      console.error('[LTMStorageService] getRelevant failed:', error);
      return [];
    }
  }

    getInstanceHistory(instanceId: string): MemoryEntry[] {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM memories
        WHERE instance_id = ?
        ORDER BY timestamp ASC
      `);

      const rows = stmt.all(instanceId) as any[];
      return rows.map((row) => this.rowToMemory(row));
    } catch (error) {
      console.error('[LTMStorageService] getInstanceHistory failed:', error);
      return [];
    }
  }

    getById(memoryId: string): MemoryEntry | null {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
      const row = stmt.get(memoryId) as any;

      return row ? this.rowToMemory(row) : null;
    } catch (error) {
      console.error('[LTMStorageService] getById failed:', error);
      return null;
    }
  }

    delete(memoryId: string): boolean {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
      const result = stmt.run(memoryId);
      return result.changes > 0;
    } catch (error) {
      console.error('[LTMStorageService] delete failed:', error);
      return false;
    }
  }

    cleanup(maxAge: number): void {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const cutoff = Date.now() - maxAge;
      const stmt = this.db.prepare('DELETE FROM memories WHERE timestamp < ?');
      const result = stmt.run(cutoff);
      console.log(`[LTMStorageService] Cleaned up ${result.changes} old memories`);
    } catch (error) {
      console.error('[LTMStorageService] cleanup failed:', error);
    }
  }

    cleanupLowImportance(minImportance: number): void {
    if (!this.db) {
      throw new Error('[LTMStorageService] Database not initialized');
    }

    try {
      const stmt = this.db.prepare('DELETE FROM memories WHERE importance < ?');
      const result = stmt.run(minImportance);
      console.log(`[LTMStorageService] Cleaned up ${result.changes} low-importance memories`);
    } catch (error) {
      console.error('[LTMStorageService] cleanupLowImportance failed:', error);
    }
  }

    getCount(): number {
    if (!this.db) {
      return 0;
    }

    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
      const result = stmt.get() as { count: number };
      return result.count;
    } catch (error) {
      console.error('[LTMStorageService] getCount failed:', error);
      return 0;
    }
  }

    private rowToMemory(row: any): MemoryEntry {
    return {
      id: row.id,
      instanceId: row.instance_id,
      roomId: row.room_id,
      agentId: row.agent_id,
      type: row.type as MemoryType,
      content: row.content,
      metadata: JSON.parse(row.metadata || '{}'),
      timestamp: row.timestamp,
      importance: row.importance,
    };
  }
}
