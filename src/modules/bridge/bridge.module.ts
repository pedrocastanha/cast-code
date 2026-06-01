import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { StateModule } from '../state/state.module';
import { BridgeCommandsService } from './commands/bridge-commands.service';
import { BridgeProtocolService } from './services/bridge-protocol.service';
import { BridgeRuntimeService } from './services/bridge-runtime.service';
import { BridgeSessionService } from './services/bridge-session.service';
import { BridgeToolExecutorService } from './services/bridge-tool-executor.service';
import { BridgeTranscriptService } from './services/bridge-transcript.service';

@Module({
  imports: [ToolsModule, StateModule],
  providers: [
    BridgeCommandsService,
    BridgeProtocolService,
    BridgeRuntimeService,
    BridgeSessionService,
    BridgeToolExecutorService,
    BridgeTranscriptService,
  ],
  exports: [BridgeCommandsService, BridgeRuntimeService, BridgeSessionService],
})
export class BridgeModule {}
