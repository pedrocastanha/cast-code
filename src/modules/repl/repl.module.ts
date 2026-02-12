import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { WelcomeScreenService } from './services/welcome-screen.service';
import { ReplCommandsService } from './services/commands/repl-commands.service';
import { GitCommandsService } from './services/commands/git-commands.service';
import { AgentCommandsService } from './services/commands/agent-commands.service';
import { McpCommandsService } from './services/commands/mcp-commands.service';
import { CoreModule } from '../core/core.module';
import { GitModule } from '../git/git.module';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [CoreModule, GitModule, AgentsModule, SkillsModule, McpModule],
  providers: [
    ReplService,
    WelcomeScreenService,
    ReplCommandsService,
    GitCommandsService,
    AgentCommandsService,
    McpCommandsService,
  ],
  exports: [ReplService],
})
export class ReplModule {}
