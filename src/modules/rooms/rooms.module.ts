import { Module, Global } from '@nestjs/common';
import { RoomEventBusService } from './services/room-event-bus.service';
import { RoomSseService } from './services/room-sse.service';
import { RoomInstanceManagerService } from './services/room-instance-manager.service';
import { RoomBridgeService } from './services/room-bridge.service';
import { LTMStorageService } from './services/ltm-storage.service';
import { LTMIndexService } from './services/ltm-index.service';
import { LTMService } from './services/ltm.service';
import { RoomsController } from './rooms.controller';

@Global()
@Module({
  providers: [
    RoomEventBusService,
    RoomSseService,
    RoomInstanceManagerService,
    RoomBridgeService,
    LTMStorageService,
    LTMIndexService,
    LTMService,
  ],
  exports: [RoomEventBusService, RoomInstanceManagerService, RoomBridgeService, LTMService],
  controllers: [RoomsController],
})
export class RoomsModule {}
