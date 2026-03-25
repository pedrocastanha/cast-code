import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { CastEvent } from '../types/event.types';

@Injectable()
export class RoomEventBusService implements OnModuleInit {
  private emitter: EventEmitter2;
  private buffer: CastEvent[] = [];
  private readonly BUFFER_SIZE = 200;

  onModuleInit() {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    });
  }

  emit(event: CastEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  on(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.on(pattern, listener);
  }

  off(pattern: string, listener: (event: CastEvent) => void): void {
    this.emitter.off(pattern, listener);
  }

  getRecentEvents(limit = 50): CastEvent[] {
    return this.buffer.slice(-limit);
  }

  getRecentEventsFiltered(filter: { instanceId?: string; roomId?: string }, limit = 50): CastEvent[] {
    return this.buffer
      .filter((e) => {
        if (filter.instanceId && filter.instanceId !== 'all' && e.instanceId !== filter.instanceId) {
          return false;
        }
        if (filter.roomId && e.roomId !== filter.roomId) {
          return false;
        }
        return true;
      })
      .slice(-limit);
  }
}
