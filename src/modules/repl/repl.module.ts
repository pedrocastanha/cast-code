import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { WelcomeScreenService } from './services/welcome-screen.service';
import { ReplCommandsService } from './services/commands/repl-commands.service';
import { GitCommandsService } from './services/commands/git-commands.service';
import { AgentCommandsService } from './services/commands/agent-commands.service';
import { McpCommandsService } from './services/commands/mcp-commands.service';
import { ConfigCommandsService } from '../config/services/config-commands.service';
import { ProjectCommandsService } from './services/commands/project-commands.service';
import { CoreModule } from '../core/core.module';
import { GitModule } from '../git/git.module';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { McpModule } from '../mcp/mcp.module';
import { ProjectModule } from '../project/project.module';
import { ConfigModule } from '../config';

@Module({
  imports: [ConfigModule, CoreModule, GitModule, AgentsModule, SkillsModule, McpModule, ProjectModule],
  providers: [
    ReplService,
    WelcomeScreenService,
    ReplCommandsService,
    GitCommandsService,
    AgentCommandsService,
    McpCommandsService,
    ConfigCommandsService,
    ProjectCommandsService,
  ],
  exports: [ReplService],
})
export class ReplModule {}
