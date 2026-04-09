import { Module } from '@nestjs/common';
import { ToolOutputProxyService } from './tool-output-proxy.service';

@Module({
  providers: [ToolOutputProxyService],
  exports: [ToolOutputProxyService],
})
export class ToolOutputProxyModule {}
