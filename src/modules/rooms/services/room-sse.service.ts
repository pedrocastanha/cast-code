import { Injectable, OnModuleInit } from '@nestjs/common';
import * as http from 'http';
import { RoomEventBusService } from './room-event-bus.service';
import { CastEvent } from '../types/event.types';

interface SseFilter {
  instanceId: string;
  roomId?: string;
}

interface SseClient {
  res: http.ServerResponse;
  filter: SseFilter;
}

@Injectable()
export class RoomSseService implements OnModuleInit {
  private server: http.Server;
  private clients: Map<string, SseClient> = new Map();
  private readonly PORT = 3335;

  constructor(private readonly eventBus: RoomEventBusService) {}

  onModuleInit() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.PORT);
    this.eventBus.on('*', (event: CastEvent) => this.fanout(event));
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://localhost:${this.PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (url.pathname === '/rooms/events' && req.method === 'GET') {
      const instanceId = url.searchParams.get('instanceId') ?? 'all';
      const roomId = url.searchParams.get('roomId') ?? undefined;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'retry': '3000',
      });

      const clientId = `${instanceId}-${roomId}-${Date.now()}`;
      this.clients.set(clientId, { res, filter: { instanceId, roomId } });

      const recent = this.eventBus.getRecentEventsFiltered({ instanceId, roomId });
      for (const event of recent) {
        res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }

      req.on('close', () => this.clients.delete(clientId));
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private fanout(event: CastEvent) {
    const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const [, client] of this.clients) {
      const { res, filter } = client;
      if (filter.instanceId !== 'all' && filter.instanceId !== event.instanceId) {
        continue;
      }
      if (filter.roomId && filter.roomId !== event.roomId) {
        continue;
      }
      try {
        res.write(payload);
      } catch {
        // Client may have disconnected
      }
    }
  }
}
