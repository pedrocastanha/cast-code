import {
  Controller,
  Get,
  Post,
  Sse,
  Body,
  Query,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigManagerService } from '../../config/services/config-manager.service';
import { getRemoteHtml } from '../views/remote-ui';

export interface RemoteMessageDto {
  message: string;
  token?: string;
}

@Controller('remote')
export class RemoteController {
  constructor(private readonly configManager: ConfigManagerService) {}

  @Get()
  getRemote(@Res() res: any, @Query('token') token?: string): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(getRemoteHtml({ token }));
  }

  @Sse('events')
  getEvents(): Observable<{ event: string; data: any }> {
    return new Observable();
  }

  @Post('message')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendMessage(@Body() dto: RemoteMessageDto): Promise<{ status: string }> {
    if (!dto?.message) {
      return { status: 'error: message is required' };
    }
    return { status: 'queued' };
  }
}
