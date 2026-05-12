import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { McpConfig, McpTool, McpConnection, McpCapabilities, McpResource, McpPrompt } from '../types';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { CastOAuthProvider } from './cast-oauth-provider';

const DEFAULT_CAPABILITIES: McpCapabilities = { tools: true, resources: false, prompts: false };

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
      resources: [],
      prompts: [],
      capabilities: DEFAULT_CAPABILITIES,
      status: 'connecting',
      reconnectAttempts: 0,
      maxReconnectAttempts: 3,
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
        process.stderr.write(`MCP ${name} stderr: ${msg}\n`);
      }
    });

    proc.on('close', (code) => {
      connection.status = 'disconnected';
      this.stdioBuffers.delete(name);
      this.emit('disconnected', name);

      if (code !== null && code !== 0 && (connection.reconnectAttempts ?? 0) < (connection.maxReconnectAttempts ?? 3)) {
        const attempt = connection.reconnectAttempts ?? 0;
        connection.reconnectAttempts = attempt + 1;
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        setTimeout(() => {
          this.reconnect(name).catch(() => {});
        }, delay);
      }
    });

    const initializeResponse = await this.sendRequest(name, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cast-code', version: '1.0.0' },
    });
    connection.capabilities = this.parseCapabilities(initializeResponse?.capabilities);

    if (connection.capabilities.tools) {
      const toolsResponse = await this.sendRequest(name, 'tools/list', {});
      connection.tools = toolsResponse?.tools || [];
    }
    if (connection.capabilities.resources) {
      connection.resources = await this.listResources(name);
    }
    if (connection.capabilities.prompts) {
      connection.prompts = await this.listPrompts(name);
    }

    connection.reconnectAttempts = 0;
  }

  private async connectHttp(name: string, connection: McpConnection): Promise<void> {
    const endpoint = connection.config.endpoint!;

    try {
      new URL(endpoint);
    } catch {
      throw new Error(`Invalid MCP HTTP endpoint: ${endpoint}`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    let provider: CastOAuthProvider | null = null;
    try {
      provider = new CastOAuthProvider(name);
      const cachedTokens = provider.tokens();
      if (cachedTokens?.access_token) {
        headers['Authorization'] = `Bearer ${cachedTokens.access_token}`;
      }
    } catch {
      provider = null;
    }

    const doFetch = async (body: object, hdrs = headers, timeoutMs = 15000): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(endpoint, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    const initBody = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cast-code', version: '1.0.0' },
      },
    };

    let initResponse = await doFetch(initBody);

    if (initResponse.status === 401) {
      connection.oauthRefreshAvailable = true;
      if (!provider) {
        throw new Error(`OAuth refresh required for ${name}`);
      }

      provider.invalidateCredentials('tokens');

      let authResult = await auth(provider, { serverUrl: endpoint });

      if (authResult === 'REDIRECT') {
        this.emit('oauth:browser-opened', name, provider.redirectUrl);
        const code = await provider.waitForCallback();
        authResult = await auth(provider, { serverUrl: endpoint, authorizationCode: code });
      }

      if (authResult !== 'AUTHORIZED') {
        throw new Error(`OAuth failed for ${name}`);
      }

      const tokens = provider.tokens();
      if (!tokens?.access_token) {
        throw new Error(`No access token for ${name} after OAuth`);
      }

      headers['Authorization'] = `Bearer ${tokens.access_token}`;
      initResponse = await doFetch(initBody);
    }

    if (!initResponse.ok) {
      throw new Error(`HTTP MCP init failed: ${initResponse.status} ${initResponse.statusText}`);
    }

    const sessionId = initResponse.headers.get('mcp-session-id');
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    (connection as any)._httpHeaders = headers;

    const initData = await initResponse.json().catch(() => null);
    connection.capabilities = this.parseCapabilities(initData?.result?.capabilities ?? initData?.capabilities);

    if (connection.capabilities.tools) {
      const toolsResponse = await this.sendHttpRequest(name, connection, 'tools/list', {});
      connection.tools = toolsResponse?.tools || [];
    }
    if (connection.capabilities.resources) {
      connection.resources = await this.listResources(name);
    }
    if (connection.capabilities.prompts) {
      connection.prompts = await this.listPrompts(name);
    }

    connection.reconnectAttempts = 0;
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
      return this.sendHttpRequest(mcpName, connection, 'tools/call', { name: toolName, arguments: args });
    }

    return null;
  }

  async listResources(name: string): Promise<McpResource[]> {
    const connection = this.connections.get(name);
    if (!connection || !connection.capabilities.resources) return connection?.resources || [];

    const response = connection.config.type === 'stdio'
      ? await this.sendRequest(name, 'resources/list', {})
      : await this.sendHttpRequest(name, connection, 'resources/list', {});
    connection.resources = response?.resources || [];
    return connection.resources;
  }

  async readResource(name: string, uri: string): Promise<any> {
    const connection = this.connections.get(name);
    if (!connection || !connection.capabilities.resources) {
      throw new Error(`MCP ${name} does not support resources`);
    }

    return connection.config.type === 'stdio'
      ? this.sendRequest(name, 'resources/read', { uri })
      : this.sendHttpRequest(name, connection, 'resources/read', { uri });
  }

  async listPrompts(name: string): Promise<McpPrompt[]> {
    const connection = this.connections.get(name);
    if (!connection || !connection.capabilities.prompts) return connection?.prompts || [];

    const response = connection.config.type === 'stdio'
      ? await this.sendRequest(name, 'prompts/list', {})
      : await this.sendHttpRequest(name, connection, 'prompts/list', {});
    connection.prompts = response?.prompts || [];
    return connection.prompts;
  }

  async getPrompt(name: string, promptName: string, args: Record<string, unknown> = {}): Promise<any> {
    const connection = this.connections.get(name);
    if (!connection || !connection.capabilities.prompts) {
      throw new Error(`MCP ${name} does not support prompts`);
    }

    return connection.config.type === 'stdio'
      ? this.sendRequest(name, 'prompts/get', { name: promptName, arguments: args })
      : this.sendHttpRequest(name, connection, 'prompts/get', { name: promptName, arguments: args });
  }

  getTools(name: string): McpTool[] {
    return this.connections.get(name)?.tools || [];
  }

  getCapabilities(name: string): McpCapabilities {
    return this.connections.get(name)?.capabilities || DEFAULT_CAPABILITIES;
  }

  getStatus(name: string): string {
    return this.connections.get(name)?.status || 'unknown';
  }

  getAuthUrl(name: string): string | undefined {
    return this.connections.get(name)?.authUrl;
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
      connection.reconnectAttempts = 0;
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

  private parseCapabilities(raw: any): McpCapabilities {
    if (!raw || typeof raw !== 'object') return DEFAULT_CAPABILITIES;
    return {
      tools: raw.tools !== undefined,
      resources: raw.resources !== undefined,
      prompts: raw.prompts !== undefined,
    };
  }

  private async sendHttpRequest(
    name: string,
    connection: McpConnection,
    method: string,
    params: Record<string, unknown>,
    retrySession = true,
  ): Promise<any> {
    const response = await fetch(connection.config.endpoint!, {
      method: 'POST',
      headers: (connection as any)._httpHeaders ?? { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method,
        params,
      }),
    });

    if (response.status === 401) {
      connection.oauthRefreshAvailable = true;
      connection.status = 'error';
      this.emit('oauth:refresh-required', name);
      return {
        error: {
          code: 401,
          message: `OAuth refresh required for MCP ${name}`,
        },
      };
    }

    const text = await response.text();
    if (!response.ok) {
      if (retrySession && /session|expired|initialize/i.test(text)) {
        await this.reinitializeHttpSession(name, connection);
        return this.sendHttpRequest(name, connection, method, params, false);
      }
      throw new Error(`HTTP MCP request failed: ${response.status} ${response.statusText}`);
    }

    const data = text ? JSON.parse(text) : {};
    return data.result || data;
  }

  private async reinitializeHttpSession(name: string, connection: McpConnection): Promise<void> {
    const headers: Record<string, string> = {
      ...((connection as any)._httpHeaders ?? {}),
      'Content-Type': 'application/json',
    };
    delete headers['Mcp-Session-Id'];

    const response = await fetch(connection.config.endpoint!, {
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

    if (!response.ok) {
      throw new Error(`HTTP MCP reinitialize failed: ${response.status} ${response.statusText}`);
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    (connection as any)._httpHeaders = headers;

    const data = await response.json().catch(() => null);
    connection.capabilities = this.parseCapabilities(data?.result?.capabilities ?? data?.capabilities);
    connection.status = 'connected';
    this.emit('reinitialized', name);
  }
}
