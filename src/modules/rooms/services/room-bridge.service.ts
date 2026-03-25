/**
 * RoomBridgeService - Cross-Terminal Bridge Server
 * 
 * HTTP server on port 3336 that enables external AI agents
 * (Claude Code, Codex, etc.) to register and communicate
 * within the same room as native cast-code agents.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as http from 'http';
import { EventEmitter2 } from 'eventemitter2';
import {
  BridgeMessage,
  BridgeRegister,
  BridgeRegisterResponse,
  BridgeUnregister,
  BridgeSendMessage,
  RegisteredAgent,
  BridgeEvent,
  BridgeEventType,
} from '../types/bridge.types';

interface BridgeClient {
  agentId: string;
  instanceId: string;
  res: http.ServerResponse;
  filter: { instanceId: string };
}

@Injectable()
export class RoomBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomBridgeService.name);
  private server: http.Server;
  private readonly PORT = 3336;
  private readonly agents: Map<string, RegisteredAgent> = new Map();
  private readonly clients: Map<string, BridgeClient> = new Map();
  private readonly eventEmitter: EventEmitter2;
  private readonly TOKEN_PREFIX = 'bridge_tok_';

  constructor() {
    this.eventEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    });
  }

  onModuleInit() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.PORT, () => {
      this.logger.log(`Room Bridge Server listening on port ${this.PORT}`);
    });
    this.logger.log('RoomBridgeService initialized');
  }

  onModuleDestroy() {
    this.server.close();
    this.logger.log('RoomBridgeService destroyed');
  }

  /**
   * Register an external agent with the bridge
   */
  async registerAgent(
    agentId: string,
    metadata: BridgeRegister,
  ): Promise<BridgeRegisterResponse> {
    const instanceId = `${this.TOKEN_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
    const token = this.generateToken();

    const agent: RegisteredAgent = {
      instanceId,
      token,
      name: metadata.name,
      tool: metadata.tool,
      roomId: metadata.roomId,
      color: metadata.color,
      model: metadata.model,
      provider: metadata.provider,
      status: 'connected',
      connectedAt: Date.now(),
      metadata: metadata.metadata,
    };

    this.agents.set(instanceId, agent);

    // Emit bridge.register event
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.register',
      agentId,
      instanceId,
      roomId: metadata.roomId,
      payload: {
        name: metadata.name,
        tool: metadata.tool,
      },
      timestamp: Date.now(),
    });

    // Emit bridge.connected event
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.connected',
      agentId,
      instanceId,
      roomId: metadata.roomId,
      payload: {
        name: metadata.name,
        tool: metadata.tool,
        model: metadata.model,
        provider: metadata.provider,
      },
      timestamp: Date.now(),
    });

    this.logger.log(`Agent registered: ${metadata.name} (${agentId}) in room ${metadata.roomId}`);

    return {
      instanceId,
      token,
      roomId: metadata.roomId,
      name: metadata.name,
    };
  }

  /**
   * Unregister an external agent from the bridge
   */
  async unregisterAgent(
    instanceId: string,
    token: string,
  ): Promise<boolean> {
    const agent = this.agents.get(instanceId);

    if (!agent) {
      this.logger.warn(`Agent not found: ${instanceId}`);
      return false;
    }

    if (agent.token !== token) {
      this.logger.warn(`Invalid token for agent: ${instanceId}`);
      return false;
    }

    // Emit bridge.disconnected event
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.disconnected',
      agentId: agent.name,
      instanceId,
      roomId: agent.roomId,
      payload: {
        name: agent.name,
        tool: agent.tool,
      },
      timestamp: Date.now(),
    });

    // Emit bridge.unregister event
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.unregister',
      agentId: agent.name,
      instanceId,
      roomId: agent.roomId,
      payload: {
        name: agent.name,
        tool: agent.tool,
      },
      timestamp: Date.now(),
    });

    this.agents.delete(instanceId);

    // Close any open SSE connections for this agent
    for (const [clientId, client] of this.clients.entries()) {
      if (client.instanceId === instanceId) {
        client.res.end();
        this.clients.delete(clientId);
      }
    }

    this.logger.log(`Agent unregistered: ${agent.name} (${instanceId})`);
    return true;
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    type: 'task' | 'result' | 'question' | 'broadcast' = 'task',
    traceId?: string,
  ): Promise<BridgeMessage> {
    const fromAgent = this.findAgentById(fromAgentId);

    if (!fromAgent) {
      throw new Error(`Agent not found: ${fromAgentId}`);
    }

    const message: BridgeMessage = {
      id: crypto.randomUUID(),
      fromAgentId,
      toAgentId,
      content,
      type,
      traceId,
      timestamp: Date.now(),
    };

    // Emit bridge.message event
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.message',
      agentId: fromAgentId,
      instanceId: fromAgent.instanceId,
      roomId: fromAgent.roomId,
      payload: {
        fromAgentId,
        toAgentId,
        content,
        message: content,
      },
      timestamp: Date.now(),
    });

    // Notify the recipient via SSE if connected
    this.notifyRecipient(message, fromAgent);

    this.logger.debug(`Message sent from ${fromAgentId} to ${toAgentId}`);

    return message;
  }

  /**
   * Broadcast a message to all agents in a room
   */
  async broadcastMessage(
    fromAgentId: string,
    content: string,
    type: 'broadcast' | 'task' | 'question' = 'broadcast',
    traceId?: string,
  ): Promise<void> {
    const fromAgent = this.findAgentById(fromAgentId);

    if (!fromAgent) {
      throw new Error(`Agent not found: ${fromAgentId}`);
    }

    const message: BridgeMessage = {
      id: crypto.randomUUID(),
      fromAgentId,
      toAgentId: 'all',
      content,
      type,
      traceId,
      timestamp: Date.now(),
    };

    // Emit bridge.message event with toAgentId='all'
    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.message',
      agentId: fromAgentId,
      instanceId: fromAgent.instanceId,
      roomId: fromAgent.roomId,
      payload: {
        fromAgentId,
        toAgentId: 'all',
        content,
        message: content,
      },
      timestamp: Date.now(),
    });

    // Broadcast to all connected clients in the same room
    for (const agent of this.agents.values()) {
      if (agent.roomId === fromAgent.roomId && agent.instanceId !== fromAgent.instanceId) {
        this.notifyClient(message, agent);
      }
    }

    this.logger.debug(`Message broadcast from ${fromAgentId} in room ${fromAgent.roomId}`);
  }

  /**
   * Get all registered agents
   */
  getRegisteredAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents in a specific room
   */
  getAgentsInRoom(roomId: string): RegisteredAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.roomId === roomId);
  }

  /**
   * Find an agent by their display name/agentId
   */
  private findAgentById(agentId: string): RegisteredAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name.toLowerCase() === agentId.toLowerCase()) {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return `${this.TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Emit a bridge event to the event emitter
   */
  private emitBridgeEvent(event: BridgeEvent): void {
    this.eventEmitter.emit(event.type, event);
    this.eventEmitter.emit('*', event);
  }

  /**
   * Notify a recipient agent of a new message via SSE
   */
  private notifyRecipient(message: BridgeMessage, fromAgent: RegisteredAgent): void {
    const toAgent = this.findAgentById(message.toAgentId);

    if (!toAgent) {
      this.logger.debug(`Recipient not found: ${message.toAgentId}`);
      return;
    }

    this.notifyClient(message, toAgent);
  }

  /**
   * Send message to a specific agent's SSE connection
   */
  private notifyClient(message: BridgeMessage, agent: RegisteredAgent): void {
    const payload = JSON.stringify({
      type: 'room.message',
      data: {
        id: message.id,
        fromAgentId: message.fromAgentId,
        fromAgentName: this.findAgentById(message.fromAgentId)?.name ?? message.fromAgentId,
        content: message.content,
        type: message.type,
        timestamp: message.timestamp,
      },
    });

    for (const client of this.clients.values()) {
      if (client.instanceId === agent.instanceId) {
        try {
          client.res.write(`data: ${payload}\n\n`);
        } catch (error) {
          this.logger.debug(`Failed to notify client ${client.instanceId}`);
        }
      }
    }
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://localhost:${this.PORT}`);
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route: POST /register - Register a new agent
    if (method === 'POST' && url.pathname === '/register') {
      this.handleRegister(req, res);
      return;
    }

    // Route: POST /unregister - Unregister an agent
    if (method === 'POST' && url.pathname === '/unregister') {
      this.handleUnregister(req, res);
      return;
    }

    // Route: POST /:instanceId/message - Send a message
    if (method === 'POST' && url.pathname.match(/^\/[^/]+\/message$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleSendMessage(req, res, instanceId);
      return;
    }

    // Route: POST /:instanceId/broadcast - Broadcast a message
    if (method === 'POST' && url.pathname.match(/^\/[^/]+\/broadcast$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleBroadcast(req, res, instanceId);
      return;
    }

    // Route: GET /:instanceId/inbox - SSE inbox subscription
    if (method === 'GET' && url.pathname.match(/^\/[^/]+\/inbox$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleInboxSse(req, res, instanceId);
      return;
    }

    // Route: GET /agents - List all registered agents
    if (method === 'GET' && url.pathname === '/agents') {
      this.handleListAgents(req, res);
      return;
    }

    // Route: GET /agents/:instanceId - Get specific agent
    if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+$/)) {
      const instanceId = url.pathname.split('/')[2];
      this.handleGetAgent(req, res, instanceId);
      return;
    }

    // Route: GET /health - Health check
    if (method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: this.PORT, agents: this.agents.size }));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle POST /register
   */
  private async handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const body = await this.readJsonBody<BridgeRegister>(req);

      if (!body.name || !body.tool || !body.roomId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: name, tool, roomId' }));
        return;
      }

      const agentId = body.name.toLowerCase().replace(/\s+/g, '-');
      const response = await this.registerAgent(agentId, body);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      this.logger.error('Register error:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle POST /unregister
   */
  private async handleUnregister(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const body = await this.readJsonBody<BridgeUnregister>(req);

      if (!body.instanceId || !body.token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: instanceId, token' }));
        return;
      }

      const success = await this.unregisterAgent(body.instanceId, body.token);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
    } catch (error) {
      this.logger.error('Unregister error:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle POST /:instanceId/message
   */
  private async handleSendMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    instanceId: string,
  ) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      const agent = this.agents.get(instanceId);

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      if (agent.token !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const body = await this.readJsonBody<BridgeSendMessage>(req);

      if (!body.content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing content' }));
        return;
      }

      if (!body.toAgentId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing toAgentId (use /broadcast for broadcast)' }));
        return;
      }

      const message = await this.sendMessage(
        agent.name,
        body.toAgentId,
        body.content,
        body.type,
        body.traceId,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Send message error:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle POST /:instanceId/broadcast
   */
  private async handleBroadcast(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    instanceId: string,
  ) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      const agent = this.agents.get(instanceId);

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }

      if (agent.token !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const body = await this.readJsonBody<BridgeSendMessage>(req);

      if (!body.content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing content' }));
        return;
      }

      await this.broadcastMessage(agent.name, body.content, body.type, body.traceId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      this.logger.error('Broadcast error:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle GET /:instanceId/inbox (SSE)
   */
  private handleInboxSse(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    instanceId: string,
  ) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    const agent = this.agents.get(instanceId);

    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }

    if (agent.token !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const clientId = `${instanceId}-inbox-${Date.now()}`;
    this.clients.set(clientId, {
      agentId: agent.name,
      instanceId,
      res,
      filter: { instanceId },
    });

    req.on('close', () => {
      this.clients.delete(clientId);
      this.logger.debug(`Inbox SSE client disconnected: ${instanceId}`);
    });

    this.logger.debug(`Inbox SSE client connected: ${instanceId}`);
  }

  /**
   * Handle GET /agents
   */
  private handleListAgents(req: http.IncomingMessage, res: http.ServerResponse) {
    const agents = this.getRegisteredAgents().map(({ token, ...agent }) => agent);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agents));
  }

  /**
   * Handle GET /agents/:instanceId
   */
  private handleGetAgent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    instanceId: string,
  ) {
    const agent = this.agents.get(instanceId);

    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }

    const { token, ...safeAgent } = agent;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safeAgent));
  }

  /**
   * Read and parse JSON body from request
   */
  private readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }
}
