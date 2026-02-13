import { Module } from '@nestjs/common';
import { ConfigManagerService } from './services/config-manager.service';
import { InitConfigService } from './services/init-config.service';
import { ConfigCommandsService } from './services/config-commands.service';

@Module({
  providers: [ConfigManagerService, InitConfigService, ConfigCommandsService],
  exports: [ConfigManagerService, InitConfigService, ConfigCommandsService],
})
export class ConfigModule {}
