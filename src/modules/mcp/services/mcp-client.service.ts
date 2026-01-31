import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { McpConfig, McpTool, McpConnection } from '../types';

@Injectable()
export class McpClientService extends EventEmitter {
  private connections: Map<string, McpConnection> = new Map();

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
        await this.connectSse(name, connection);
      } else if (config.type === 'http' && config.endpoint) {
        await this.connectHttp(name, connection);
      }

      connection.status = 'connected';
      return true;
    } catch {
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

    proc.stdout?.on('data', (data: Buffer) => {
      this.handleMessage(name, data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`MCP ${name} stderr:`, data.toString());
    });

    proc.on('close', () => {
      connection.status = 'disconnected';
      this.emit('disconnected', name);
    });

    await this.sendRequest(name, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cast-code', version: '1.0.0' },
    });

    const toolsResponse = await this.sendRequest(name, 'tools/list', {});
    connection.tools = toolsResponse?.tools || [];
  }

  private async connectSse(name: string, connection: McpConnection): Promise<void> {
    connection.tools = [];
  }

  private async connectHttp(name: string, connection: McpConnection): Promise<void> {
    const response = await fetch(`${connection.config.endpoint}/tools/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      connection.tools = data.tools || [];
    }
  }

  private handleMessage(name: string, message: string) {
    try {
      const parsed = JSON.parse(message);
      this.emit(`response:${name}`, parsed);
    } catch {
      throw new TypeError('Invalid JSON message received from MCP');
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
      const id = Date.now().toString();
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });

      const handler = (response: any) => {
        if (response.id === id) {
          this.off(`response:${name}`, handler);
          resolve(response.result);
        }
      };

      this.on(`response:${name}`, handler);
      (connection.process as ChildProcess).stdin?.write(request + '\n');

      setTimeout(() => {
        this.off(`response:${name}`, handler);
        resolve(null);
      }, 10000);
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
      const response = await fetch(`${connection.config.endpoint}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, arguments: args }),
      });
      return response.json();
    }

    return null;
  }

  getTools(name: string): McpTool[] {
    return this.connections.get(name)?.tools || [];
  }

  disconnect(name: string) {
    const connection = this.connections.get(name);

    if (connection?.process) {
      (connection.process as ChildProcess).kill();
    }

    this.connections.delete(name);
  }

  disconnectAll() {
    for (const name of this.connections.keys()) {
      this.disconnect(name);
    }
  }
}
