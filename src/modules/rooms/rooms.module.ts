import { Module, Global } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RoomEventBusService } from './services/room-event-bus.service';
import { RoomSseService } from './services/room-sse.service';
import { RoomInstanceManagerService } from './services/room-instance-manager.service';
import { RoomBridgeService } from './services/room-bridge.service';
import { RoomInboxService } from './services/room-inbox.service';
import { LTMStorageService } from './services/ltm-storage.service';
import { LTMIndexService } from './services/ltm-index.service';
import { LTMService } from './services/ltm.service';
import { RoomsController } from './rooms.controller';

@Global()
@Module({
  imports: [CoreModule],
  providers: [
    RoomEventBusService,
    RoomSseService,
    RoomInstanceManagerService,
    RoomBridgeService,
    RoomInboxService,
    LTMStorageService,
    LTMIndexService,
    LTMService,
  ],
  exports: [RoomEventBusService, RoomInstanceManagerService, RoomBridgeService, LTMService, RoomInboxService],
  controllers: [RoomsController],
})
export class RoomsModule {}
