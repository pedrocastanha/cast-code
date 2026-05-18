import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StateDbService } from './state-db.service';
import { StateRedactionService } from './state-redaction.service';
import { LocalMessage, LocalSearchResult, LocalSession, LocalSessionSummary, LocalToolCall } from '../types/state.types';

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

  async getSession(id: string): Promise<LocalSessionSummary | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare(`
      select
        s.id,
        s.project_root,
        s.platform_project_id,
        s.environment_id,
        s.started_at,
        s.ended_at,
        s.model,
        s.total_tokens,
        s.total_cost,
        coalesce(m.message_count, 0) as message_count,
        coalesce(t.tool_call_count, 0) as tool_call_count,
        coalesce(m.last_message_at, t.last_tool_at, s.ended_at, s.started_at) as last_activity_at,
        (
          select coalesce(lm.content_preview, lm.redacted_content)
          from local_messages lm
          where lm.session_id = s.id
          order by lm.created_at desc
          limit 1
        ) as preview
      from local_sessions s
      left join (
        select session_id, count(*) as message_count, max(created_at) as last_message_at
        from local_messages
        group by session_id
      ) m on m.session_id = s.id
      left join (
        select session_id, count(*) as tool_call_count, max(created_at) as last_tool_at
        from local_tool_calls
        group by session_id
      ) t on t.session_id = s.id
      where s.id = ?
      limit 1
    `).get(id) as any | undefined;
    return row ? this.toSessionSummary(row) : null;
  }

  async findSession(selector: string, projectRoot?: string): Promise<LocalSessionSummary | null> {
    const trimmed = selector.trim();
    if (!trimmed) {
      return null;
    }

    const db = await this.dbService.getDb();
    const exact = db.prepare(`
      select id
      from local_sessions
      where (id = ? or id like ?)
        and (? is null or project_root = ?)
      order by started_at desc
      limit 1
    `).get(trimmed, `${trimmed}%`, projectRoot ?? null, projectRoot ?? null) as { id: string } | undefined;
    if (exact) {
      return this.getSession(exact.id);
    }

    const matches = await this.searchSessions(trimmed, projectRoot, 1);
    return matches[0] ?? null;
  }

  async listSessions(projectRoot?: string, limit = 20): Promise<LocalSessionSummary[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select
        s.id,
        s.project_root,
        s.platform_project_id,
        s.environment_id,
        s.started_at,
        s.ended_at,
        s.model,
        s.total_tokens,
        s.total_cost,
        coalesce(m.message_count, 0) as message_count,
        coalesce(t.tool_call_count, 0) as tool_call_count,
        coalesce(m.last_message_at, t.last_tool_at, s.ended_at, s.started_at) as last_activity_at,
        (
          select coalesce(lm.content_preview, lm.redacted_content)
          from local_messages lm
          where lm.session_id = s.id
          order by lm.created_at desc
          limit 1
        ) as preview
      from local_sessions s
      left join (
        select session_id, count(*) as message_count, max(created_at) as last_message_at
        from local_messages
        group by session_id
      ) m on m.session_id = s.id
      left join (
        select session_id, count(*) as tool_call_count, max(created_at) as last_tool_at
        from local_tool_calls
        group by session_id
      ) t on t.session_id = s.id
      where (? is null or s.project_root = ?)
      order by coalesce(m.last_message_at, t.last_tool_at, s.ended_at, s.started_at) desc
      limit ?
    `).all(projectRoot ?? null, projectRoot ?? null, safeLimit) as any[];

    return rows.map((row) => this.toSessionSummary(row));
  }

  async searchSessions(query: string, projectRoot?: string, limit = 20): Promise<LocalSessionSummary[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const results = await this.search(query, safeLimit * 5);
    const sessionIds: string[] = [];
    const seen = new Set<string>();
    for (const result of results) {
      if (!seen.has(result.sessionId)) {
        seen.add(result.sessionId);
        sessionIds.push(result.sessionId);
      }
      if (sessionIds.length >= safeLimit) {
        break;
      }
    }

    const summaries: LocalSessionSummary[] = [];
    for (const sessionId of sessionIds) {
      const summary = await this.getSession(sessionId);
      if (summary && (!projectRoot || summary.projectRoot === projectRoot)) {
        const match = results.find((result) => result.sessionId === sessionId);
        summaries.push(match ? { ...summary, preview: this.stripFtsMarkers(match.preview) || summary.preview } : summary);
      }
    }
    return summaries;
  }

  async listSessionMessages(sessionId: string, limit = 20): Promise<LocalMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select id, session_id, role, content_preview, content_hash, redacted_content, created_at
      from local_messages
      where session_id = ?
      order by created_at desc
      limit ?
    `).all(sessionId, safeLimit) as any[];
    return rows.reverse().map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      contentPreview: row.content_preview ?? undefined,
      contentHash: row.content_hash ?? undefined,
      redactedContent: row.redacted_content ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async listSessionToolCalls(sessionId: string, limit = 20): Promise<LocalToolCall[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select id, session_id, message_id, tool_name, input_redacted, output_preview, status, latency_ms, created_at
      from local_tool_calls
      where session_id = ?
      order by created_at desc
      limit ?
    `).all(sessionId, safeLimit) as any[];
    return rows.reverse().map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      messageId: row.message_id ?? undefined,
      toolName: row.tool_name,
      inputRedacted: row.input_redacted ?? undefined,
      outputPreview: row.output_preview ?? undefined,
      status: row.status,
      latencyMs: row.latency_ms ?? undefined,
      createdAt: row.created_at,
    }));
  }

  private toSessionSummary(row: any): LocalSessionSummary {
    return {
      id: row.id,
      projectRoot: row.project_root,
      platformProjectId: row.platform_project_id ?? undefined,
      environmentId: row.environment_id ?? undefined,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      model: row.model ?? undefined,
      totalTokens: row.total_tokens ?? 0,
      totalCost: row.total_cost ?? 0,
      messageCount: row.message_count ?? 0,
      toolCallCount: row.tool_call_count ?? 0,
      lastActivityAt: row.last_activity_at ?? undefined,
      preview: row.preview ?? undefined,
    };
  }

  private stripFtsMarkers(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.replace(/\[|\]/g, '');
  }
}
