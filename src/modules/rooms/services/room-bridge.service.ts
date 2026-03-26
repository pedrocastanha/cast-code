
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as http from 'http';
import * as crypto from 'crypto';
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
import { CastEvent, AgentEventType } from '../types/event.types';
import { RoomEventBusService } from './room-event-bus.service';

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

  constructor(private readonly eventBus: RoomEventBusService) {
    this.eventEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    });
  }

  onModuleInit() {
    if (process.env.CAST_BRIDGE_MODE === '1') return;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.PORT, () => {
      this.logger.log(`Room Bridge Server listening on port ${this.PORT}`);
    });
    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ PORTA ${this.PORT} (Room Bridge) JÁ ESTÁ EM USO! Você tem outro terminal rodando o Cast CLI em background?\n`);
        setTimeout(() => process.exit(1), 100);
      }
    });
    this.logger.log('RoomBridgeService initialized');
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close();
    }
    this.logger.log('RoomBridgeService destroyed');
  }

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

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'bridge.connected' as any,
      agentId,
      instanceId,
      roomId: metadata.roomId,
      source: 'bridge',
      payload: {
        instanceName: metadata.name,
        bridgeTool: metadata.tool,
        model: metadata.model,
        provider: metadata.provider,
      } as any,
      timestamp: Date.now(),
    });

    // Emit instance.created to the SSE event bus so the frontend can track this agent
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'instance.created',
      agentId,
      instanceId,
      roomId: metadata.roomId,
      source: 'bridge',
      payload: {
        instanceName: metadata.name,
        model: metadata.model,
        provider: metadata.provider,
        color: metadata.color,
        bridgeTool: metadata.tool,
      },
      timestamp: Date.now(),
    });

    console.log(`\n✅ Agent connected: "${metadata.name}" [${metadata.tool}] → room "${metadata.roomId}" (${instanceId})\n`);
    this.logger.log(`Agent registered: ${metadata.name} (${agentId}) in room ${metadata.roomId}`);

    return {
      instanceId,
      token,
      roomId: metadata.roomId,
      name: metadata.name,
    };
  }

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

    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'bridge.disconnected' as any,
      agentId: agent.name,
      instanceId,
      roomId: agent.roomId,
      source: 'bridge',
      payload: {
        name: agent.name,
        tool: agent.tool,
      },
      timestamp: Date.now(),
    });

    
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

    // Emit instance.destroyed to event bus
    this.eventBus.emit({
      id: crypto.randomUUID(),
      type: 'instance.destroyed',
      agentId: agent.name,
      instanceId,
      roomId: agent.roomId,
      source: 'bridge',
      payload: {},
      timestamp: Date.now(),
    });


    for (const [clientId, client] of this.clients.entries()) {
      if (client.instanceId === instanceId) {
        client.res.end();
        this.clients.delete(clientId);
      }
    }

    console.log(`\n👋 Agent disconnected: "${agent.name}" from room "${agent.roomId}"\n`);
    this.logger.log(`Agent unregistered: ${agent.name} (${instanceId})`);
    return true;
  }

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

    // Forward to SSE event bus for frontend visualization
    this.eventBus.emit({
      id: message.id,
      type: 'agent.message.sent',
      agentId: fromAgentId,
      instanceId: fromAgent.instanceId,
      roomId: fromAgent.roomId,
      source: 'bridge',
      payload: { message: content, toAgentId, fromAgentId, traceId },
      timestamp: message.timestamp,
    });


    this.notifyRecipient(message, fromAgent);

    this.logger.debug(`Message sent from ${fromAgentId} to ${toAgentId}`);

    return message;
  }

    async broadcastMessage(
    fromAgentId: string,
    content: string,
    type: 'broadcast' | 'task' | 'question' = 'broadcast',
    traceId?: string,
  ): Promise<void> {
    const fromAgent = this.findAgentById(fromAgentId);

    if (!fromAgent && fromAgentId !== 'user') {
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


    this.emitBridgeEvent({
      id: crypto.randomUUID(),
      type: 'bridge.message',
      agentId: fromAgentId,
      instanceId: fromAgent?.instanceId || 'user',
      roomId: fromAgent?.roomId || 'bar',
      payload: {
        fromAgentId,
        toAgentId: 'all',
        content,
        message: content,
      },
      timestamp: Date.now(),
    });

    // Forward to SSE event bus for frontend visualization
    this.eventBus.emit({
      id: message.id,
      type: 'agent.message.sent',
      agentId: fromAgentId,
      instanceId: fromAgent?.instanceId || 'user',
      roomId: fromAgent?.roomId || 'bar',
      source: 'bridge',
      payload: { message: content, toAgentId: 'all', fromAgentId, traceId },
      timestamp: message.timestamp,
    });


    const sendingRoomId = fromAgent?.roomId || 'bar';

    for (const agent of this.agents.values()) {
      if (agent.roomId === sendingRoomId && agent.instanceId !== fromAgent?.instanceId) {
        this.notifyClient(message, agent);
      }
    }

    this.logger.debug(`Message broadcast from ${fromAgentId} in room ${sendingRoomId}`);
  }

    getRegisteredAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

    getAgentsInRoom(roomId: string): RegisteredAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.roomId === roomId);
  }

    private findAgentById(agentId: string): RegisteredAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name.toLowerCase() === agentId.toLowerCase()) {
        return agent;
      }
    }
    return undefined;
  }

    private generateToken(): string {
    return `${this.TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  }

    private emitBridgeEvent(event: BridgeEvent): void {
    this.eventEmitter.emit(event.type, event);
    this.eventEmitter.emit('*', event);
  }

    private notifyRecipient(message: BridgeMessage, fromAgent: RegisteredAgent): void {
    const toAgent = this.findAgentById(message.toAgentId);

    if (!toAgent) {
      this.logger.debug(`Recipient not found: ${message.toAgentId}`);
      return;
    }

    this.notifyClient(message, toAgent);
  }

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

    
    if (method === 'POST' && url.pathname === '/register') {
      this.handleRegister(req, res);
      return;
    }

    
    if (method === 'POST' && url.pathname === '/unregister') {
      this.handleUnregister(req, res);
      return;
    }

    
    if (method === 'POST' && url.pathname.match(/^\/[^/]+\/message$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleSendMessage(req, res, instanceId);
      return;
    }

    
    if (method === 'POST' && url.pathname.match(/^\/[^/]+\/broadcast$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleBroadcast(req, res, instanceId);
      return;
    }


    if (method === 'GET' && url.pathname.match(/^\/[^/]+\/inbox$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleInboxSse(req, res, instanceId);
      return;
    }

    // Event forwarding from CLI bridge agent (tool output, thinking, etc.)
    if (method === 'POST' && url.pathname.match(/^\/[^/]+\/event$/)) {
      const instanceId = url.pathname.split('/')[1];
      this.handleEventForward(req, res, instanceId);
      return;
    }

    
    if (method === 'GET' && url.pathname === '/agents') {
      this.handleListAgents(req, res);
      return;
    }

    
    if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+$/)) {
      const instanceId = url.pathname.split('/')[2];
      this.handleGetAgent(req, res, instanceId);
      return;
    }

    
    if (method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: this.PORT, agents: this.agents.size }));
      return;
    }

    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

    private async handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const body = await this.readJsonBody<BridgeRegister>(req);

      this.logger.log(`\n📥 Registration request received:\n`);
      this.logger.log(`   Name: ${body.name}\n`);
      this.logger.log(`   Tool: ${body.tool}\n`);
      this.logger.log(`   Room: ${body.roomId}\n`);
      this.logger.log(`   Color: ${body.color}\n`);

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

    private handleListAgents(req: http.IncomingMessage, res: http.ServerResponse) {
    const agents = this.getRegisteredAgents().map(({ token, ...agent }) => agent);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agents));
  }

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

    private async handleEventForward(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    instanceId: string,
  ) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');
      const agent = this.agents.get(instanceId);

      if (!agent || agent.token !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const body = await this.readJsonBody<{ type: string; payload: Record<string, unknown> }>(req);

      const castEvent: CastEvent = {
        id: crypto.randomUUID(),
        type: body.type as AgentEventType,
        agentId: agent.name,
        instanceId,
        roomId: agent.roomId,
        source: 'bridge',
        payload: {
          message: body.payload?.message as string | undefined,
          toolName: body.payload?.toolName as string | undefined,
          error: body.payload?.error as string | undefined,
        },
        timestamp: Date.now(),
      };

      this.eventBus.emit(castEvent);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      this.logger.error('Event forward error:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

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
