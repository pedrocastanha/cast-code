import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as http from 'http';
import { exec } from 'child_process';
import { TaskManagementService } from '../../tasks/services/task-management.service';
import { getKanbanHtml } from '../views/kanban-ui';
import { TaskStatus } from '../../tasks/types/task.types';

@Injectable()
export class KanbanServerService {
  private server: http.Server | null = null;
  private sseClients: http.ServerResponse[] = [];
  private port = 3333;
  private deepAgent: any = null;

  constructor(
    private readonly taskService: TaskManagementService,
    private readonly moduleRef: ModuleRef
  ) { }

  private async getDeepAgent() {
    if (!this.deepAgent) {
      const { DeepAgentService } = await import('../../core/services/deep-agent.service');
      this.deepAgent = this.moduleRef.get(DeepAgentService, { strict: false });
    }
    return this.deepAgent;
  }

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
      try { client.end(); } catch { }
    }
    this.sseClients = [];
    this.server.close();
    this.server = null;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === '/api/events') {
      this.handleSSE(res);
    } else if (url === '/api/state') {
      this.handleState(res);
    } else if (url === '/api/tasks' && method === 'POST') {
      await this.handleCreateTask(req, res);
    } else if (url === '/api/tasks/auto-execute' && method === 'POST') {
      await this.handleAutoExecute(res);
    } else if (url.startsWith('/api/tasks/') && method === 'PATCH') {
      const parts = url.split('/');
      const taskId = parts[parts.length - 1];
      await this.handleUpdateTask(taskId, req, res);
    } else if (url.startsWith('/api/tasks/') && url.endsWith('/execute') && method === 'POST') {
      const parts = url.split('/');
      const taskId = parts[parts.length - 2];
      await this.handleExecuteTask(taskId, res);
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  }

  private async handleCreateTask(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { subject, description } = JSON.parse(body);
        const task = this.taskService.createTask({ subject, description });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private async handleUpdateTask(taskId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const updates = JSON.parse(body);
        const oldTask = this.taskService.getTask(taskId);
        const task = this.taskService.updateTask(taskId, updates);

        if (task) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(task));

          if (updates.status === TaskStatus.IN_PROGRESS && oldTask?.status !== TaskStatus.IN_PROGRESS) {
            this.runAgentForTask(task);
          }
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Task not found' }));
        }
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private async handleAutoExecute(res: http.ServerResponse): Promise<void> {
    const tasks = this.taskService.listTasks().filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.FAILED);

    if (tasks.length === 0) {
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'No tasks to execute' }));
      return;
    }

    res.writeHead(202);
    res.end(JSON.stringify({ message: 'Auto-planning started' }));

    (async () => {
      try {
        const agent = await this.getDeepAgent();
        const taskList = tasks.map(t => `- [${t.id}] ${t.subject}: ${t.description}`).join('\n');

        const prompt = `Você é o Coordenador do Kanban. Existem as seguintes tarefas pendentes:\n\n${taskList}\n\n` +
          `Sua missão é executá-las. Para que o usuário veja seu progresso no Board, você DEVE seguir este protocolo rigidamente:\n` +
          `1. Escolha a tarefa mais prioritária.\n` +
          `2. Chame 'task_update' com status='in_progress' para o ID da tarefa ANTES de começar.\n` +
          `3. Execute o trabalho necessário.\n` +
          `4. Chame 'task_update' com status='test' assim que terminar para o controle de qualidade humano.\n` +
          `5. Repita para a próxima tarefa.\n\n` +
          `Pode começar agora.`;

        process.stdout.write(`\n  Kanban: Starting intelligent auto-planner for ${tasks.length} tasks...\r\n`);

        for await (const chunk of agent.chat(prompt)) {
          process.stdout.write(chunk);
        }
      } catch (err) {
        process.stdout.write(`  Kanban: Auto-planner error: ${err}\r\n`);
      }
    })();
  }

  private async handleExecuteTask(taskId: string, res: http.ServerResponse): Promise<void> {
    const task = this.taskService.getTask(taskId);
    if (!task) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Task not found' }));
      return;
    }

    if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.FAILED) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Task already in progress or completed' }));
      return;
    }

    res.writeHead(202);
    res.end(JSON.stringify({ message: 'Execution started' }));

    this.runAgentForTask(task);
  }

  private async runAgentForTask(task: any): Promise<void> {
    const taskId = task.id;
    (async () => {
      try {
        process.stdout.write(`\n  Kanban: Starting task ${taskId}: ${task.subject}\r\n`);
        this.taskService.updateTask(taskId, { status: TaskStatus.IN_PROGRESS, assignedAgent: 'deep-agent' });

        const agent = await this.getDeepAgent();
        const result = await agent.executeTask(task);

        if (result.success) {
          this.taskService.updateTask(taskId, { status: TaskStatus.TEST });
          process.stdout.write(`  Kanban: Task ${taskId} sent to test\r\n`);
        } else {
          this.taskService.updateTask(taskId, { status: TaskStatus.FAILED });
          process.stdout.write(`  Kanban: Task ${taskId} failed: ${result.error}\r\n`);
        }
      } catch (err) {
        this.taskService.updateTask(taskId, { status: TaskStatus.FAILED });
        process.stdout.write(`  Kanban: Error executing task ${taskId}: ${err}\r\n`);
      }
    })();
  }

  private broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch { }
    }
  }
}
