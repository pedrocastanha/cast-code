import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { RoomInstanceManagerService } from './services/room-instance-manager.service';
import { DeepAgentService } from '../core/services/deep-agent.service';
import { RoomBridgeService } from './services/room-bridge.service';

interface CreateInstanceDto {
  roomId?: string;
  agentId?: string;
}

interface CreateTaskDto {
  message: string;
}

interface BroadcastMessageDto {
  content: string;
  type?: 'broadcast' | 'task' | 'question';
}

interface SendMessageDto {
  content: string;
  type?: 'task' | 'question' | 'broadcast';
}

@Controller('rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(
    private readonly instanceManager: RoomInstanceManagerService,
    private readonly deepAgentService: DeepAgentService,
    private readonly roomBridge: RoomBridgeService,
  ) {}

    @Post(':roomId/instances')
  @HttpCode(HttpStatus.CREATED)
  async createInstance(
    @Param('roomId') roomId: string,
    @Body() body: CreateInstanceDto,
  ): Promise<{ instanceId: string; roomId: string; status: string }> {
    const instanceId = crypto.randomUUID();
    const agentId = body.agentId ?? 'orchestrator';

    this.logger.log(`Creating instance ${instanceId} for room ${roomId}`);

    
    const instance = await this.instanceManager.createInstance(instanceId, {
      roomId,
      agentId,
    });

    
    
    this.instanceManager.registerDeepAgent(instanceId, this.deepAgentService);

    return {
      instanceId: instance.instanceId,
      roomId: instance.roomId,
      status: instance.status,
    };
  }

  @Post(':roomId/spawn')
  @HttpCode(HttpStatus.ACCEPTED)
  async spawnAgent(
    @Param('roomId') roomId: string,
    @Body() body: { tool: string; name?: string; color?: string },
  ): Promise<{ status: string }> {
    const tool = body.tool || 'claude';
    const name = body.name || 'Agent';
    const color = body.color || '#38bdf8';

    const { spawn } = require('child_process');
    const path = require('path');
    
    const mainScript = path.resolve(process.cwd(), 'dist', 'main.js');

    const args = [
      mainScript,
      'bridge',
      '--name', name,
      '--room', roomId,
      '--color', color,
      '--reactive',
      '--',
      tool
    ];

    this.logger.log(`Spawning background agent: node ${args.join(' ')}`);

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        AGENT_NAME: name,
        AGENT_ROLE: tool.includes('mock') ? 'Mock Assistant' : 'AI Assistant',
      },
    });
    
    child.unref();

    return { status: 'spawned' };
  }

    @Delete(':roomId/instances/:instanceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroyInstance(
    @Param('roomId') roomId: string,
    @Param('instanceId') instanceId: string,
  ): Promise<void> {
    this.logger.log(`Destroying instance ${instanceId} for room ${roomId}`);

    
    const instance = this.instanceManager.getInstance(instanceId);
    if (instance.roomId !== roomId) {
      throw new BadRequestException(
        `Instance ${instanceId} does not belong to room ${roomId}`,
      );
    }

    await this.instanceManager.destroyInstance(instanceId);
  }

    @Get('instances')
  async listInstances(
    @Body('roomId') roomId?: string,
  ): Promise<
    Array<{
      instanceId: string;
      roomId: string;
      agentId: string;
      createdAt: number;
      status: string;
    }>
  > {
    const instances = this.instanceManager.listInstances(roomId);
    return instances.map((instance) => ({
      instanceId: instance.instanceId,
      roomId: instance.roomId,
      agentId: instance.agentId,
      createdAt: instance.createdAt,
      status: instance.status,
    }));
  }

    @Get('instances/:instanceId')
  async getInstance(
    @Param('instanceId') instanceId: string,
  ): Promise<{
    instanceId: string;
    roomId: string;
    agentId: string;
    createdAt: number;
    status: string;
  }> {
    const instance = this.instanceManager.getInstance(instanceId);
    return {
      instanceId: instance.instanceId,
      roomId: instance.roomId,
      agentId: instance.agentId,
      createdAt: instance.createdAt,
      status: instance.status,
    };
  }

    @Post('instances/:instanceId/tasks')
  async createTask(
    @Param('instanceId') instanceId: string,
    @Body() body: CreateTaskDto,
  ): Promise<{
    instanceId: string;
    message: string;
    status: string;
    timestamp: number;
  }> {
    this.logger.log(`Creating task for instance ${instanceId}: ${body.message}`);

    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException('Message is required');
    }

    const instance = this.instanceManager.getInstance(instanceId);

    
    const deepAgent = instance.deepAgent;

    if (!deepAgent) {
      return {
        instanceId,
        message: body.message,
        status: 'queued',
        timestamp: Date.now(),
      };
    }

    
    
    return {
      instanceId,
      message: body.message,
      status: 'processing',
      timestamp: Date.now(),
    };
  }

    @Get('instances/:instanceId/state')
  async getInstanceState(
    @Param('instanceId') instanceId: string,
  ): Promise<{
    instanceId: string;
    roomId: string;
    agentId: string;
    status: string;
    createdAt: number;
    hasDeepAgent: boolean;
  }> {
    const instance = this.instanceManager.getInstance(instanceId);

    return {
      instanceId: instance.instanceId,
      roomId: instance.roomId,
      agentId: instance.agentId,
      status: instance.status,
      createdAt: instance.createdAt,
      hasDeepAgent: !!instance.deepAgent,
    };
  }

    @Post(':roomId/broadcast')
  @HttpCode(HttpStatus.ACCEPTED)
  async broadcastMessage(
    @Param('roomId') roomId: string,
    @Body() body: BroadcastMessageDto,
  ): Promise<{ status: string; message: string }> {
    this.logger.log(`Broadcasting message to room ${roomId}: ${body.content}`);

    try {
      await this.roomBridge.broadcastMessage('user', body.content, body.type || 'broadcast');
      return { status: 'sent', message: body.content };
    } catch (error) {
      this.logger.error('Broadcast error:', (error as Error).message);
      throw new BadRequestException('Failed to broadcast message');
    }
  }

    @Post('task/:agentId')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendTask(
    @Param('agentId') agentId: string,
    @Body() body: SendMessageDto,
  ): Promise<{ status: string; message: string; agentId: string }> {
    this.logger.log(`Sending task to agent ${agentId}: ${body.content}`);

    try {
      await this.roomBridge.sendMessage('user', agentId, body.content, body.type || 'task');
      return { status: 'sent', message: body.content, agentId };
    } catch (error) {
      this.logger.error('Send task error:', (error as Error).message);
      throw new BadRequestException('Failed to send task to agent');
    }
  }
}
