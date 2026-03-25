import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { CastEvent } from '../types/event.types';
import { RoomEventBusService } from './room-event-bus.service';

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

  constructor(private readonly eventBus: RoomEventBusService) {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    });
  }

    async createInstance(
    instanceId: string,
    options: CreateInstanceOptions = {},
  ): Promise<RoomInstance> {
    const roomId = options.roomId ?? 'bar';
    const agentId = options.agentId ?? 'orchestrator';

    this.logger.log(`Creating instance ${instanceId} for room ${roomId}`);

    
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
      
      
      instance.status = 'ready';

      
      this.emitInstanceEvent('instance.created', instanceId, roomId, agentId);

      this.logger.log(`Instance ${instanceId} created successfully`);
      return instance;
    } catch (error) {
      instance.status = 'error';
      this.logger.error(`Failed to create instance ${instanceId}: ${error}`);
      throw error;
    }
  }

    async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    this.logger.log(`Destroying instance ${instanceId}`);

    
    

    const { roomId, agentId } = instance;
    this.instances.delete(instanceId);

    
    this.emitInstanceEvent('instance.destroyed', instanceId, roomId, agentId);

    this.logger.log(`Instance ${instanceId} destroyed successfully`);
  }

    getInstance(instanceId: string): RoomInstance {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    return instance;
  }

    listInstances(roomId?: string): RoomInstance[] {
    const allInstances = Array.from(this.instances.values());

    if (!roomId) {
      return allInstances;
    }

    return allInstances.filter((instance) => instance.roomId === roomId);
  }

    hasInstance(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

    getInstanceCount(): number {
    return this.instances.size;
  }

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

    getDeepAgent(instanceId: string): DeepAgentService {
    const instance = this.getInstance(instanceId);

    if (!instance.deepAgent) {
      throw new NotFoundException(`DeepAgent not initialized for instance ${instanceId}`);
    }

    return instance.deepAgent;
  }

    onEvent(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.on(pattern, listener);
  }

    offEvent(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.off(pattern, listener);
  }

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
      payload: {
        instanceName: agentId,
      },
      timestamp: Date.now(),
    };

    this.emitter.emit(eventType, event);
    this.emitter.emit('*', event);
    // Forward to event bus so SSE clients receive it
    this.eventBus.emit(event);
  }
}
