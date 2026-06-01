import { Module, forwardRef } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { McpModule } from '../mcp/mcp.module';
import { SkillsModule } from '../skills/skills.module';
import { PlatformCacheService } from './services/platform-cache.service';
import { PlatformClientService } from './services/platform-client.service';
import { PlatformConfigService } from './services/platform-config.service';
import { PlatformService } from './services/platform.service';
import { RemoteDefinitionAdapterService } from './services/remote-definition-adapter.service';
import { SessionTrackerService } from './services/session-tracker.service';
import { CastLinkService } from './services/cast-link.service';

@Module({
  imports: [forwardRef(() => SkillsModule), forwardRef(() => AgentsModule), forwardRef(() => McpModule)],
  providers: [
    PlatformCacheService,
    PlatformClientService,
    PlatformConfigService,
    PlatformService,
    RemoteDefinitionAdapterService,
    SessionTrackerService,
    CastLinkService,
  ],
  exports: [
    PlatformCacheService,
    PlatformClientService,
    PlatformConfigService,
    PlatformService,
    RemoteDefinitionAdapterService,
    SessionTrackerService,
    CastLinkService,
  ],
})
export class PlatformModule {}
