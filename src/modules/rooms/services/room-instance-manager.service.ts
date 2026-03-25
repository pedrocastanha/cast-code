import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { CastEvent } from '../types/event.types';

export interface RoomInstance {
  instanceId: string;
  roomId: string;
  agentId: string;
  createdAt: number;
  status: 'initializing' | 'ready' | 'error';
  deepAgent: DeepAgentService;
}

export interface CreateInstanceOptions {
  roomId?: string;
  agentId?: string;
}

export interface InstanceTask {
  message: string;
  timestamp: number;
}

@Injectable()
export class RoomInstanceManagerService {
  private readonly logger = new Logger(RoomInstanceManagerService.name);
  private readonly instances = new Map<string, RoomInstance>();
  private readonly emitter: EventEmitter2;

  constructor() {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    });
  }

  /**
   * Create a new room instance with its own DeepAgentService
   */
  async createInstance(
    instanceId: string,
    options: CreateInstanceOptions = {},
  ): Promise<RoomInstance> {
    const roomId = options.roomId ?? 'bar';
    const agentId = options.agentId ?? 'orchestrator';

    this.logger.log(`Creating instance ${instanceId} for room ${roomId}`);

    // Create instance record in initializing state
    const instance: RoomInstance = {
      instanceId,
      roomId,
      agentId,
      createdAt: Date.now(),
      status: 'initializing',
      deepAgent: null as unknown as DeepAgentService,
    };

    this.instances.set(instanceId, instance);

    try {
      // DeepAgentService will be injected and initialized by the caller
      // For now, mark as ready - the actual DeepAgentService injection happens externally
      instance.status = 'ready';

      // Emit instance.created event
      this.emitInstanceEvent('instance.created', instanceId, roomId, agentId);

      this.logger.log(`Instance ${instanceId} created successfully`);
      return instance;
    } catch (error) {
      instance.status = 'error';
      this.logger.error(`Failed to create instance ${instanceId}: ${error}`);
      throw error;
    }
  }

  /**
   * Destroy a room instance and clean up resources
   */
  async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    this.logger.log(`Destroying instance ${instanceId}`);

    // Note: DeepAgentService cleanup would happen here if needed
    // For now, we just remove it from the registry

    const { roomId, agentId } = instance;
    this.instances.delete(instanceId);

    // Emit instance.destroyed event
    this.emitInstanceEvent('instance.destroyed', instanceId, roomId, agentId);

    this.logger.log(`Instance ${instanceId} destroyed successfully`);
  }

  /**
   * Get a specific instance by ID
   */
  getInstance(instanceId: string): RoomInstance {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    return instance;
  }

  /**
   * List all instances, optionally filtered by roomId
   */
  listInstances(roomId?: string): RoomInstance[] {
    const allInstances = Array.from(this.instances.values());

    if (!roomId) {
      return allInstances;
    }

    return allInstances.filter((instance) => instance.roomId === roomId);
  }

  /**
   * Check if an instance exists
   */
  hasInstance(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * Get instance count
   */
  getInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * Register a DeepAgentService with an existing instance
   */
  registerDeepAgent(
    instanceId: string,
    deepAgent: DeepAgentService,
  ): void {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    instance.deepAgent = deepAgent;
    this.logger.log(`DeepAgent registered with instance ${instanceId}`);
  }

  /**
   * Get the DeepAgentService for an instance
   */
  getDeepAgent(instanceId: string): DeepAgentService {
    const instance = this.getInstance(instanceId);

    if (!instance.deepAgent) {
      throw new NotFoundException(`DeepAgent not initialized for instance ${instanceId}`);
    }

    return instance.deepAgent;
  }

  /**
   * Subscribe to instance events
   */
  onEvent(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.on(pattern, listener);
  }

  /**
   * Unsubscribe from instance events
   */
  offEvent(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.off(pattern, listener);
  }

  /**
   * Emit an instance lifecycle event
   */
  private emitInstanceEvent(
    eventType: 'instance.created' | 'instance.destroyed',
    instanceId: string,
    roomId: string,
    agentId: string,
  ): void {
    const event: CastEvent = {
      id: crypto.randomUUID(),
      type: eventType,
      agentId,
      instanceId,
      roomId,
      source: 'native',
      payload: {},
      timestamp: Date.now(),
    };

    this.emitter.emit(eventType, event);
    this.emitter.emit('*', event);
  }
}
