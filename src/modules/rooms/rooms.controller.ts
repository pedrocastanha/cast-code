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
import { DeepAgentService } from '../../core/services/deep-agent.service';

interface CreateInstanceDto {
  roomId?: string;
  agentId?: string;
}

interface CreateTaskDto {
  message: string;
}

@Controller('rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(
    private readonly instanceManager: RoomInstanceManagerService,
    private readonly deepAgentService: DeepAgentService,
  ) {}

  /**
   * POST /rooms/:roomId/instances
   * Create a new room instance
   */
  @Post(':roomId/instances')
  @HttpCode(HttpStatus.CREATED)
  async createInstance(
    @Param('roomId') roomId: string,
    @Body() body: CreateInstanceDto,
  ): Promise<{ instanceId: string; roomId: string; status: string }> {
    const instanceId = crypto.randomUUID();
    const agentId = body.agentId ?? 'orchestrator';

    this.logger.log(`Creating instance ${instanceId} for room ${roomId}`);

    // Create the instance
    const instance = await this.instanceManager.createInstance(instanceId, {
      roomId,
      agentId,
    });

    // Register the DeepAgentService with this instance
    // The DeepAgentService uses instanceId/roomId internally for event emission
    this.instanceManager.registerDeepAgent(instanceId, this.deepAgentService);

    return {
      instanceId: instance.instanceId,
      roomId: instance.roomId,
      status: instance.status,
    };
  }

  /**
   * DELETE /rooms/:roomId/instances/:instanceId
   * Destroy a room instance
   */
  @Delete(':roomId/instances/:instanceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroyInstance(
    @Param('roomId') roomId: string,
    @Param('instanceId') instanceId: string,
  ): Promise<void> {
    this.logger.log(`Destroying instance ${instanceId} for room ${roomId}`);

    // Verify the instance belongs to the specified room
    const instance = this.instanceManager.getInstance(instanceId);
    if (instance.roomId !== roomId) {
      throw new BadRequestException(
        `Instance ${instanceId} does not belong to room ${roomId}`,
      );
    }

    await this.instanceManager.destroyInstance(instanceId);
  }

  /**
   * GET /rooms/instances
   * List all instances, optionally filtered by roomId
   */
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

  /**
   * GET /rooms/instances/:instanceId
   * Get a specific instance by ID
   */
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

  /**
   * POST /rooms/instances/:instanceId/tasks
   * Create a task in a specific instance
   * This endpoint sends a message to the DeepAgentService for processing
   */
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

    // Get the DeepAgentService for this instance
    const deepAgent = instance.deepAgent;

    if (!deepAgent) {
      return {
        instanceId,
        message: body.message,
        status: 'queued',
        timestamp: Date.now(),
      };
    }

    // Note: In a full implementation, you would call deepAgent.chat(body.message)
    // and stream the response. For now, we return processing status.
    return {
      instanceId,
      message: body.message,
      status: 'processing',
      timestamp: Date.now(),
    };
  }

  /**
   * GET /rooms/instances/:instanceId/state
   * Get the current state of an instance
   */
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
}
