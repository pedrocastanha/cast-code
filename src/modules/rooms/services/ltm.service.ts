/**
 * LTM Service
 * 
 * Main orchestrator for Long Term Memory functionality.
 * Listens to RoomEventBusService events and auto-stores important events.
 * Provides unified API for memory operations.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RoomEventBusService } from './room-event-bus.service';
import { LTMStorageService } from './ltm-storage.service';
import { LTMIndexService } from './ltm-index.service';
import { CastEvent } from '../types/event.types';
import { MemoryEntry, MemoryType, MemoryFilters, MemoryMetadata } from '../types/ltm.types';

@Injectable()
export class LTMService implements OnModuleInit, OnModuleDestroy {
  private readonly AUTO_STORE_EVENTS: AgentEventType[] = [
    'agent.task.completed',
    'agent.tool.called',
    'agent.tool.completed',
    'agent.task.failed',
    'agent.tool.failed',
  ];

  private readonly IMPORTANCE_THRESHOLDS: Record<MemoryType, number> = {
    task_completed: 0.7,
    tool_result: 0.5,
    conversation: 0.4,
    insight: 0.9,
    error: 0.8,
    code_snippet: 0.6,
  };

  private eventListener: ((event: CastEvent) => void) | null = null;

  constructor(
    private readonly eventBus: RoomEventBusService,
    private readonly storage: LTMStorageService,
    private readonly indexer: LTMIndexService,
  ) {}

  onModuleInit() {
    // Listen to events and auto-store important ones
    this.eventListener = (event: CastEvent) => this.handleEvent(event);
    this.eventBus.on('*', this.eventListener);

    // Load existing memories into index on startup
    this.rebuildIndex();
  }

  onModuleDestroy() {
    if (this.eventListener) {
      this.eventBus.off('*', this.eventListener);
    }
  }

  /**
   * Get memories by searching with query and filters
   */
  getMemories(query: string, filters?: MemoryFilters): MemoryEntry[] {
    const semanticResults = this.indexer.search(query, 20);
    const storageResults = this.storage.search(query, filters || {});

    // Merge and deduplicate results
    const merged = new Map<string, MemoryEntry>();

    for (const memory of semanticResults) {
      merged.set(memory.id, memory);
    }

    for (const memory of storageResults) {
      merged.set(memory.id, memory);
    }

    return Array.from(merged.values()).slice(0, 15);
  }

  /**
   * Add a memory entry to storage and index
   */
  addMemory(entry: MemoryEntry): void {
    try {
      this.storage.store(entry);
      this.indexer.index(entry);
    } catch (error) {
      console.error('[LTMService] Failed to add memory:', error);
      throw error;
    }
  }

  /**
   * Remove a memory by ID
   */
  forget(memoryId: string): boolean {
    try {
      const deleted = this.storage.delete(memoryId);
      if (deleted) {
        this.indexer.remove(memoryId);
      }
      return deleted;
    } catch (error) {
      console.error('[LTMService] Failed to forget memory:', error);
      return false;
    }
  }

  /**
   * Get relevant memories for a given context
   */
  getRelevantContext(context: string, limit: number = 10): MemoryEntry[] {
    return this.indexer.searchWithRecency(context, limit);
  }

  /**
   * Get instance history
   */
  getInstanceHistory(instanceId: string): MemoryEntry[] {
    return this.storage.getInstanceHistory(instanceId);
  }

  /**
   * Search memories with filters
   */
  searchMemories(query: string, filters: MemoryFilters): MemoryEntry[] {
    return this.storage.search(query, filters);
  }

  /**
   * Get memory by ID
   */
  getMemoryById(memoryId: string): MemoryEntry | null {
    return this.storage.getById(memoryId);
  }

  /**
   * Get memory count
   */
  getMemoryCount(): number {
    return this.storage.getCount();
  }

  /**
   * Cleanup old memories
   */
  cleanup(maxAge: number): void {
    this.storage.cleanup(maxAge);
  }

  /**
   * Create a memory entry from a CastEvent
   */
  private eventToMemory(event: CastEvent): MemoryEntry | null {
    const { type, payload } = event;

    let memoryType: MemoryType | null = null;
    let content = '';
    let importance = 0.5;
    const metadata: MemoryMetadata = {};

    switch (type) {
      case 'agent.task.completed':
        memoryType = 'task_completed';
        content = `Task completed: ${payload.taskSubject || payload.taskId || 'unknown task'}`;
        importance = 0.7;
        metadata.taskId = payload.taskId;
        metadata.taskSubject = payload.taskSubject;
        break;

      case 'agent.task.failed':
        memoryType = 'error';
        content = `Task failed: ${payload.taskSubject || payload.taskId}. Error: ${payload.error || 'unknown error'}`;
        importance = 0.8;
        metadata.taskId = payload.taskId;
        metadata.taskSubject = payload.taskSubject;
        break;

      case 'agent.tool.called':
      case 'agent.tool.completed':
        memoryType = 'tool_result';
        content = `Tool ${payload.toolName} ${type === 'agent.tool.completed' ? 'completed' : 'called'}: ${JSON.stringify(payload.toolArgs || {})}`;
        importance = 0.5;
        metadata.toolName = payload.toolName;
        if (payload.toolOutput) {
          content += ` Output: ${payload.toolOutput.slice(0, 500)}`;
        }
        break;

      case 'agent.tool.failed':
        memoryType = 'error';
        content = `Tool ${payload.toolName} failed: ${payload.error || 'unknown error'}`;
        importance = 0.7;
        metadata.toolName = payload.toolName;
        break;

      default:
        return null;
    }

    if (!memoryType) return null;

    return {
      id: `mem_${event.id}`,
      instanceId: event.instanceId,
      roomId: event.roomId,
      agentId: event.agentId,
      type: memoryType,
      content,
      metadata,
      timestamp: event.timestamp,
      importance: this.IMPORTANCE_THRESHOLDS[memoryType] || importance,
    };
  }

  /**
   * Handle incoming events from the event bus
   */
  private handleEvent(event: CastEvent): void {
    if (!this.AUTO_STORE_EVENTS.includes(event.type as AgentEventType)) {
      return;
    }

    const memory = this.eventToMemory(event);
    if (memory) {
      try {
        this.addMemory(memory);
      } catch (error) {
        console.error('[LTMService] Failed to auto-store event:', error);
      }
    }
  }

  /**
   * Rebuild the in-memory index from persistent storage
   */
  private rebuildIndex(): void {
    try {
      // Get all memories from storage
      const allMemories = this.storage.search('', {});

      // Index each one
      for (const memory of allMemories) {
        this.indexer.index(memory);
      }

      console.log(`[LTMService] Rebuilt index with ${allMemories.length} memories`);
    } catch (error) {
      console.error('[LTMService] Failed to rebuild index:', error);
    }
  }

  /**
   * Store an insight memory
   */
  storeInsight(
    instanceId: string,
    roomId: string,
    agentId: string,
    insight: string,
    metadata?: MemoryMetadata,
  ): void {
    const entry: MemoryEntry = {
      id: `mem_insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      instanceId,
      roomId,
      agentId,
      type: 'insight',
      content: insight,
      metadata: metadata || {},
      timestamp: Date.now(),
      importance: this.IMPORTANCE_THRESHOLDS.insight,
    };

    this.addMemory(entry);
  }

  /**
   * Store a conversation memory
   */
  storeConversation(
    instanceId: string,
    roomId: string,
    agentId: string,
    message: string,
    metadata?: MemoryMetadata,
  ): void {
    const entry: MemoryEntry = {
      id: `mem_conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      instanceId,
      roomId,
      agentId,
      type: 'conversation',
      content: message,
      metadata: metadata || {},
      timestamp: Date.now(),
      importance: this.IMPORTANCE_THRESHOLDS.conversation,
    };

    this.addMemory(entry);
  }

  /**
   * Store a code snippet memory
   */
  storeCodeSnippet(
    instanceId: string,
    roomId: string,
    agentId: string,
    code: string,
    filePath?: string,
    metadata?: MemoryMetadata,
  ): void {
    const entry: MemoryEntry = {
      id: `mem_code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      instanceId,
      roomId,
      agentId,
      type: 'code_snippet',
      content: code,
      metadata: {
        ...metadata,
        filePath,
      },
      timestamp: Date.now(),
      importance: this.IMPORTANCE_THRESHOLDS.code_snippet,
    };

    this.addMemory(entry);
  }
}

type AgentEventType = CastEvent['type'];
