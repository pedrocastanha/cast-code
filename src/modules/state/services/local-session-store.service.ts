import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StateDbService } from './state-db.service';
import { StateRedactionService } from './state-redaction.service';
import { LocalMessage, LocalSearchResult, LocalSession, LocalToolCall } from '../types/state.types';

@Injectable()
export class LocalSessionStoreService {
  constructor(
    private readonly dbService: StateDbService,
    private readonly redaction: StateRedactionService,
  ) {}

  async startSession(input: {
    projectRoot: string;
    platformProjectId?: string;
    environmentId?: string;
    model?: string;
  }): Promise<LocalSession> {
    const session: LocalSession = {
      id: crypto.randomUUID(),
      projectRoot: input.projectRoot,
      platformProjectId: input.platformProjectId,
      environmentId: input.environmentId,
      model: input.model,
      startedAt: new Date().toISOString(),
      totalTokens: 0,
      totalCost: 0,
    };

    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into local_sessions (
          id, project_root, platform_project_id, environment_id, started_at, model, total_tokens, total_cost
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.projectRoot,
        session.platformProjectId ?? null,
        session.environmentId ?? null,
        session.startedAt,
        session.model ?? null,
        session.totalTokens,
        session.totalCost,
      );
    });

    return session;
  }

  async endSession(id: string, summary: {
    totalTokens?: number;
    totalCost?: number;
  } = {}): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        update local_sessions
        set ended_at = ?, total_tokens = coalesce(?, total_tokens), total_cost = coalesce(?, total_cost)
        where id = ?
      `).run(new Date().toISOString(), summary.totalTokens ?? null, summary.totalCost ?? null, id);
    });
  }

  async recordMessage(input: Omit<LocalMessage, 'id' | 'createdAt'>): Promise<LocalMessage> {
    const rawContent = input.redactedContent ?? input.contentPreview ?? '';
    const redactedContent = this.redaction.redact(rawContent);
    const message: LocalMessage = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      redactedContent,
      contentPreview: input.contentPreview
        ? this.redaction.contentPreview(input.contentPreview)
        : this.redaction.contentPreview(rawContent),
      contentHash: input.contentHash ?? this.redaction.contentHash(rawContent),
      createdAt: new Date().toISOString(),
    };

    await this.dbService.executeWrite((db) => {
      const insertMessage = db.prepare(`
        insert into local_messages (
          id, session_id, role, content_preview, content_hash, redacted_content, created_at
        ) values (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFts = db.prepare(`
        insert into local_state_fts (kind, entity_id, session_id, title, body, created_at)
        values ('message', ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        insertMessage.run(
          message.id,
          message.sessionId,
          message.role,
          message.contentPreview ?? null,
          message.contentHash ?? null,
          message.redactedContent ?? null,
          message.createdAt,
        );
        insertFts.run(
          message.id,
          message.sessionId,
          message.role,
          [message.contentPreview, message.redactedContent].filter(Boolean).join('\n'),
          message.createdAt,
        );
      })();
    });

    return message;
  }

  async recordToolCall(input: Omit<LocalToolCall, 'id' | 'createdAt'>): Promise<LocalToolCall> {
    const rawInput = input.inputRedacted ?? '';
    const rawOutput = input.outputPreview ?? '';
    const toolCall: LocalToolCall = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      messageId: input.messageId,
      toolName: input.toolName,
      inputRedacted: input.inputRedacted === undefined ? undefined : this.redaction.redact(rawInput),
      outputPreview: input.outputPreview === undefined ? undefined : this.redaction.contentPreview(rawOutput),
      status: input.status,
      latencyMs: input.latencyMs,
      createdAt: new Date().toISOString(),
    };

    await this.dbService.executeWrite((db) => {
      const insertToolCall = db.prepare(`
        insert into local_tool_calls (
          id, session_id, message_id, tool_name, input_redacted, output_preview, status, latency_ms, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFts = db.prepare(`
        insert into local_state_fts (kind, entity_id, session_id, title, body, created_at)
        values ('tool_call', ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        insertToolCall.run(
          toolCall.id,
          toolCall.sessionId,
          toolCall.messageId ?? null,
          toolCall.toolName,
          toolCall.inputRedacted ?? null,
          toolCall.outputPreview ?? null,
          toolCall.status,
          toolCall.latencyMs ?? null,
          toolCall.createdAt,
        );
        insertFts.run(
          toolCall.id,
          toolCall.sessionId,
          toolCall.toolName,
          [toolCall.inputRedacted, toolCall.outputPreview, toolCall.status].filter(Boolean).join('\n'),
          toolCall.createdAt,
        );
      })();
    });

    return toolCall;
  }

  async search(query: string, limit = 20): Promise<LocalSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 100));
    try {
      const db = await this.dbService.getDb();
      const rows = db.prepare(`
        select kind, entity_id, session_id, title, snippet(local_state_fts, 4, '[', ']', '...', 20) as preview, created_at
        from local_state_fts
        where local_state_fts match ?
        order by rank
        limit ?
      `).all(trimmed, safeLimit) as any[];

      return rows.map((row) => ({
        kind: row.kind,
        id: row.entity_id,
        sessionId: row.session_id,
        title: row.title,
        preview: row.preview,
        createdAt: row.created_at,
      }));
    } catch (error) {
      if (/fts5|syntax|unterminated|malformed/i.test(error instanceof Error ? error.message : String(error))) {
        return [];
      }
      throw error;
    }
  }
}
