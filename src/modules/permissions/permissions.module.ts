import { Module } from '@nestjs/common';
import { PermissionService } from './services/permission.service';
import { PromptService } from './services/prompt.service';

@Module({
  providers: [PermissionService, PromptService],
  exports: [PermissionService, PromptService],
})
export class PermissionsModule {}
