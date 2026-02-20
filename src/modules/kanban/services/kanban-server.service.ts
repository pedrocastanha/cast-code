import { Injectable } from '@nestjs/common';
import * as http from 'http';
import { exec } from 'child_process';
import { TaskManagementService } from '../../tasks/services/task-management.service';
import { getKanbanHtml } from '../views/kanban-ui';

@Injectable()
export class KanbanServerService {
  private server: http.Server | null = null;
  private sseClients: http.ServerResponse[] = [];
  private port = 3333;

  constructor(private readonly taskService: TaskManagementService) {}

  start(): void {
    if (this.server) {
      process.stdout.write(`  Kanban already running at http://localhost:${this.port}\r\n`);
      return;
    }

    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(this.port, () => {
      process.stdout.write(`  Kanban: http://localhost:${this.port}\r\n`);
      exec(`xdg-open http://localhost:${this.port}`);
    });

    this.taskService.events.on('task:created', (task) => this.broadcast('task:created', task));
    this.taskService.events.on('task:updated', (task) => this.broadcast('task:updated', task));
    this.taskService.events.on('plan:created', (plan) => this.broadcast('plan:created', plan));

    process.on('exit', () => this.stop());
  }

  stop(): void {
    if (!this.server) return;
    for (const client of this.sseClients) {
      try { client.end(); } catch {}
    }
    this.sseClients = [];
    this.server.close();
    this.server = null;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';

    if (url === '/api/events') {
      this.handleSSE(res);
    } else if (url === '/api/state') {
      this.handleState(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getKanbanHtml());
    }
  }

  private handleSSE(res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':\n\n');

    this.sseClients.push(res);

    res.on('close', () => {
      this.sseClients = this.sseClients.filter(c => c !== res);
    });
  }

  private handleState(res: http.ServerResponse): void {
    const tasks = this.taskService.listTasks();
    const plans = Array.from(this.taskService.getPlans().values());
    const body = JSON.stringify({ tasks, plans });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  }

  private broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch {}
    }
  }
}
