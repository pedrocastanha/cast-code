import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as http from 'http';
import { exec } from 'child_process';
import { TaskManagementService } from '../../tasks/services/task-management.service';
import { getKanbanHtml } from '../views/kanban-ui';
import { TaskStatus } from '../../tasks/types/task.types';

export type KanbanStartResult =
  | { ok: true; url: string; port: number; alreadyRunning: boolean }
  | { ok: false; error: string; code?: string };

@Injectable()
export class KanbanServerService {
  private static readonly TASK_TIMEOUT_MS = 10 * 60 * 1000;
  private server: http.Server | null = null;
  private sseClients: http.ServerResponse[] = [];
  private port = 3334;
  private deepAgent: any = null;
  private taskEventListenersAttached = false;

  constructor(
    private readonly taskService: TaskManagementService,
    private readonly moduleRef: ModuleRef,
  ) { }

  private async getDeepAgent() {
    if (!this.deepAgent) {
      const { DeepAgentService } = await import('../../core/services/deep-agent.service');
      this.deepAgent = this.moduleRef.get(DeepAgentService, { strict: false });
    }
    return this.deepAgent;
  }

  async start(openBrowser = true): Promise<KanbanStartResult> {
    if (this.server) {
      const url = this.getUrl();
      if (openBrowser) {
        process.stdout.write(`  Kanban already running at ${url}\r\n`);
      }
      return { ok: true, url, port: this.port, alreadyRunning: true };
    }

    const preferredPort = this.getPreferredPort();
    const maxPort = Math.min(65535, preferredPort + 10);
    let lastError: NodeJS.ErrnoException | null = null;

    for (let port = preferredPort; port <= maxPort; port += 1) {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res).catch((error) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        });
      });

      const result = await this.listen(server, port);
      if (result.ok) {
        this.server = server;
        this.port = port;
        this.attachTaskEventListeners();
        process.on('exit', () => {
          void this.stop();
        });

        const url = this.getUrl();
        if (openBrowser) {
          process.stdout.write(`  Kanban: ${url}\r\n`);
          exec(`xdg-open ${url}`);
        }

        return { ok: true, url, port, alreadyRunning: false };
      }

      lastError = result.error;
    }

    const message = lastError?.code === 'EADDRINUSE'
      ? `Kanban ports ${preferredPort}-${maxPort} are already in use.`
      : `Kanban failed to start: ${lastError?.message || 'unknown error'}`;
    return { ok: false, error: message, code: lastError?.code };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    for (const client of this.sseClients) {
      try { client.end(); } catch { }
    }
    this.sseClients = [];
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private getPreferredPort(): number {
    const value = Number(process.env.CAST_KANBAN_PORT || 3334);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return 3334;
    }
    return value;
  }

  private getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  private listen(server: http.Server, port: number): Promise<{ ok: true } | { ok: false; error: NodeJS.ErrnoException }> {
    return new Promise((resolve) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        try {
          server.close(() => undefined);
        } catch {
          // Server may never have reached the listening state.
        }
        resolve({ ok: false, error });
      };
      const onListening = () => {
        server.off('error', onError);
        resolve({ ok: true });
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port);
    });
  }

  private attachTaskEventListeners(): void {
    if (this.taskEventListenersAttached) {
      return;
    }

    this.taskEventListenersAttached = true;
    this.taskService.events.on('task:created', (task) => this.broadcast('task:created', task));
    this.taskService.events.on('task:updated', (task) => this.broadcast('task:updated', task));
    this.taskService.events.on('plan:created', (plan) => this.broadcast('plan:created', plan));
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
          'Sua missão é executá-las. Para que o usuário veja seu progresso no Board, você DEVE seguir este protocolo rigidamente:\n' +
          '1. Escolha a tarefa mais prioritária.\n' +
          '2. Chame \'task_update\' com status=\'in_progress\' para o ID da tarefa ANTES de começar.\n' +
          '3. Execute o trabalho necessário.\n' +
          '4. Chame \'task_update\' com status=\'test\' assim que terminar para o controle de qualidade humano.\n' +
          '5. Repita para a próxima tarefa.\n\n' +
          'Pode começar agora.';

        const startMsg = `\n  Kanban: Starting intelligent auto-planner for ${tasks.length} tasks...\r\n`;
        process.stdout.write(startMsg);

        for await (const chunk of agent.chat(prompt)) {
          process.stdout.write(chunk);
        }
      } catch (err) {
        const errMsg = `  Kanban: Auto-planner error: ${err}\r\n`;
        process.stdout.write(errMsg);
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
    const executionId = `${taskId}-${Date.now()}`;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const isCurrentExecutionActive = (): boolean => {
      const currentTask = this.taskService.getTask(taskId);
      return (
        !!currentTask &&
        currentTask.status === TaskStatus.IN_PROGRESS &&
        currentTask.metadata?.executionId === executionId
      );
    };

    const writeExecutionLog = (message: string): void => {
      process.stdout.write(message);
    };

    (async () => {
      try {
        writeExecutionLog(`\n  Kanban: Starting task ${taskId}: ${task.subject}\r\n`);
        this.taskService.updateTask(taskId, {
          status: TaskStatus.IN_PROGRESS,
          assignedAgent: 'deep-agent',
          metadata: {
            ...task.metadata,
            executionId,
            executionStartedAt: Date.now(),
            lastRunError: null,
          },
        });

        timeoutHandle = setTimeout(() => {
          const currentTask = this.taskService.getTask(taskId);
          const currentExecutionId = currentTask?.metadata?.executionId;

          if (
            currentTask &&
            currentTask.status === TaskStatus.IN_PROGRESS &&
            currentExecutionId === executionId
          ) {
            this.taskService.updateTask(taskId, {
              status: TaskStatus.FAILED,
              metadata: {
                executionId,
                lastRunError: `Task exceeded ${(KanbanServerService.TASK_TIMEOUT_MS / 60000).toFixed(0)} minutes without finishing.`,
                lastRunSummary: null,
                executionFinishedAt: Date.now(),
              },
            });
            writeExecutionLog(`  Kanban: Task ${taskId} timed out and was moved to failed\r\n`);
          }
        }, KanbanServerService.TASK_TIMEOUT_MS);

        const agent = await this.getDeepAgent();
        const result = await agent.executeTask(task);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        if (!isCurrentExecutionActive()) {
          writeExecutionLog(`  Kanban: Ignoring stale result for task ${taskId}\r\n`);
          return;
        }

        if (result.success) {
          this.taskService.updateTask(taskId, {
            status: TaskStatus.TEST,
            metadata: {
              executionId,
              lastRunSummary: result.output || 'Execution finished successfully.',
              lastRunError: null,
              executionFinishedAt: Date.now(),
            },
          });
          writeExecutionLog(`  Kanban: Task ${taskId} sent to test\r\n`);
        } else {
          this.taskService.updateTask(taskId, {
            status: TaskStatus.FAILED,
            metadata: {
              executionId,
              lastRunError: result.error || 'Task execution failed.',
              lastRunSummary: result.output || null,
              executionFinishedAt: Date.now(),
            },
          });
          writeExecutionLog(`  Kanban: Task ${taskId} failed: ${result.error}\r\n`);
        }
      } catch (err) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.taskService.updateTask(taskId, {
          status: TaskStatus.FAILED,
          metadata: {
            executionId,
            lastRunError: String(err),
            executionFinishedAt: Date.now(),
          },
        });
        writeExecutionLog(`  Kanban: Error executing task ${taskId}: ${err}\r\n`);
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
