import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { McpConfig, McpTool, McpConnection } from '../types';

@Injectable()
export class McpClientService extends EventEmitter {
  private connections: Map<string, McpConnection> = new Map();
  private stdioBuffers: Map<string, string> = new Map();
  private requestIdCounter = 0;

  async connect(name: string, config: McpConfig): Promise<boolean> {
    if (this.connections.has(name)) {
      const existing = this.connections.get(name)!;
      if (existing.status === 'connected') {
        return true;
      }
    }

    const connection: McpConnection = {
      config,
      tools: [],
      status: 'connecting',
    };

    this.connections.set(name, connection);

    try {
      if (config.type === 'stdio' && config.command) {
        await this.connectStdio(name, connection);
      } else if (config.type === 'sse' && config.endpoint) {
        throw new Error('SSE transport not yet supported. Use stdio or http instead.');
      } else if (config.type === 'http' && config.endpoint) {
        await this.connectHttp(name, connection);
      }

      connection.status = 'connected';
      return true;
    } catch (error) {
      connection.status = 'error';
      return false;
    }
  }

  private async connectStdio(name: string, connection: McpConnection): Promise<void> {
    const { command, args = [], env = {} } = connection.config;

    const proc = spawn(command!, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    connection.process = proc;
    this.stdioBuffers.set(name, '');

    proc.stdout?.on('data', (data: Buffer) => {
      const buffer = (this.stdioBuffers.get(name) || '') + data.toString();
      const lines = buffer.split('\n');

      this.stdioBuffers.set(name, lines.pop() || '');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          this.emit(`response:${name}`, parsed);
        } catch {
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.startsWith('Debugger') && !msg.startsWith('Warning')) {
        console.error(`MCP ${name} stderr:`, msg);
      }
    });

    proc.on('close', (code) => {
      connection.status = 'disconnected';
      this.stdioBuffers.delete(name);
      this.emit('disconnected', name);

      if (code !== null && code !== 0) {
        setTimeout(() => {
          this.reconnect(name).catch(() => {});
        }, 3000);
      }
    });

    await this.sendRequest(name, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cast-code', version: '1.0.0' },
    });

    const toolsResponse = await this.sendRequest(name, 'tools/list', {});
    connection.tools = toolsResponse?.tools || [];
  }

  private async connectHttp(name: string, connection: McpConnection): Promise<void> {
    const endpoint = connection.config.endpoint!;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (connection.config.env?.AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${connection.config.env.AUTH_TOKEN}`;
    }

    const initResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cast-code', version: '1.0.0' },
        },
      }),
    });

    if (!initResponse.ok) {
      throw new Error(`HTTP MCP init failed: ${initResponse.status} ${initResponse.statusText}`);
    }

    const toolsResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'tools/list',
        params: {},
      }),
    });

    if (toolsResponse.ok) {
      const data = await toolsResponse.json();
      connection.tools = data.result?.tools || data.tools || [];
    }
  }

  private sendRequest(
    name: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    const connection = this.connections.get(name);

    if (!connection?.process) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const id = this.nextId();
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      let resolved = false;

      const handler = (response: any) => {
        if (response.id === id && !resolved) {
          resolved = true;
          this.off(`response:${name}`, handler);
          resolve(response.result);
        }
      };

      this.on(`response:${name}`, handler);
      (connection.process as ChildProcess).stdin?.write(request + '\n');

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.off(`response:${name}`, handler);
          resolve(null);
        }
      }, 15000);
    });
  }

  async callTool(
    mcpName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    const connection = this.connections.get(mcpName);

    if (!connection || connection.status !== 'connected') {
      throw new Error(`MCP ${mcpName} not connected`);
    }

    if (connection.config.type === 'stdio') {
      return this.sendRequest(mcpName, 'tools/call', { name: toolName, arguments: args });
    }

    if (connection.config.type === 'http') {
      const endpoint = connection.config.endpoint!;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (connection.config.env?.AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${connection.config.env.AUTH_TOKEN}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId(),
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      });

      const data = await response.json();
      return data.result || data;
    }

    return null;
  }

  getTools(name: string): McpTool[] {
    return this.connections.get(name)?.tools || [];
  }

  getStatus(name: string): string {
    return this.connections.get(name)?.status || 'unknown';
  }

  getAllStatuses(): Map<string, string> {
    const statuses = new Map<string, string>();
    for (const [name, conn] of this.connections) {
      statuses.set(name, conn.status);
    }
    return statuses;
  }

  private async reconnect(name: string): Promise<boolean> {
    const connection = this.connections.get(name);
    if (!connection) return false;

    if (connection.process) {
      try {
        (connection.process as ChildProcess).kill();
      } catch {}
    }

    connection.status = 'connecting';
    try {
      if (connection.config.type === 'stdio') {
        await this.connectStdio(name, connection);
      } else if (connection.config.type === 'http') {
        await this.connectHttp(name, connection);
      }
      connection.status = 'connected';
      this.emit('reconnected', name);
      return true;
    } catch {
      connection.status = 'error';
      return false;
    }
  }

  disconnect(name: string) {
    const connection = this.connections.get(name);

    if (connection?.process) {
      (connection.process as ChildProcess).kill();
    }

    this.stdioBuffers.delete(name);
    this.connections.delete(name);
  }

  disconnectAll() {
    for (const name of this.connections.keys()) {
      this.disconnect(name);
    }
  }

  private nextId(): string {
    return `${++this.requestIdCounter}`;
  }
}
