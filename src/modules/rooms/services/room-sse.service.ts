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
    if (process.env.CAST_BRIDGE_MODE === '1') return;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.PORT);
    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ PORTA ${this.PORT} (Room SSE) JÁ ESTÁ EM USO! Você tem outro terminal rodando o Cast CLI em background? Feche-o antes de iniciar um novo.\n`);
        setTimeout(() => process.exit(1), 100);
      }
    });
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

    if (req.method === 'POST') {
      const match = url.pathname.match(/^\/rooms\/([^\/]+)\/spawn$/);
      if (match) {
        const roomId = match[1];
        let bodyStr = '';
        req.on('data', chunk => bodyStr += chunk);
        req.on('end', () => {
          try {
            const body = JSON.parse(bodyStr);
            const tool = body.tool || 'claude';
            const name = body.name || 'Agent';
            const color = body.color || '#38bdf8';

            const { spawn } = require('child_process');
            const path = require('path');

            // Use the compiled dist/main.js from the current working directory
            const mainScript = path.resolve(process.cwd(), 'dist', 'main.js');

            const args = [
              mainScript,
              'bridge',
              '--name', name,
              '--room', roomId,
              '--color', color,
              '--',
              tool
            ];

            console.log(`\n🤖 Spawning agent "${name}" (${tool}) in room "${roomId}"...`);
            console.log(`   Command: node ${args.join(' ')}\n`);

            const child = spawn(process.execPath, args, {
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'],  // pipe both stdout and stderr
              env: { ...process.env, FORCE_COLOR: '1' },
              cwd: process.cwd(),
            });

            child.stdout?.on('data', (data: Buffer) => {
              process.stdout.write(`[bridge:${name}] ${data}`);
            });

            child.stderr?.on('data', (data: Buffer) => {
              process.stderr.write(`[bridge:${name}] ${data}`);
            });

            child.on('error', (err: Error) => {
              console.error(`\n❌ Failed to start agent "${name}": ${err.message}\n`);
            });

            child.on('exit', (code, signal) => {
              console.error(`\n⚠️  Agent "${name}" exited with code ${code} (signal: ${signal})\n`);
            });

            child.unref();

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'spawned' }));
          } catch (err) {
            console.error(`\n❌ Spawn error: ${(err as Error).message}\n`);
            res.writeHead(400); res.end();
          }
        });
        return;
      }
    }

    if (req.method === 'GET') {
      const fs = require('fs');
      const path = require('path');
      let pathname = url.pathname;
      if (pathname === '/' || pathname === '/rooms') {
        pathname = '/index.html';
      }
      
      const basePath = path.join(process.cwd(), 'src', 'modules', 'rooms', 'static');
      const filePath = path.join(basePath, pathname);

      if (filePath.startsWith(basePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(404);
    res.end();
  }

  // Lifecycle events are sent as named SSE events (caught by specific addEventListener in frontend).
  // Agent state events are sent as unnamed events (caught by onmessage → dispatch in frontend).
  private static readonly NAMED_EVENTS = new Set([
    'instance.created',
    'instance.destroyed',
    'bridge.connected',
    'bridge.disconnected',
  ]);

  private fanout(event: CastEvent) {
    const isNamed = RoomSseService.NAMED_EVENTS.has(event.type);
    const payload = isNamed
      ? `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
      : `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
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
        
      }
    }
  }
}
