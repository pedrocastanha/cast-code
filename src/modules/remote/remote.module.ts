import { Module } from '@nestjs/common';
import { RemoteServerService } from './services/remote-server.service';
import { RemoteController } from './controllers/remote.controller';
import { ConfigModule } from '../config/config.module';

@Module({
    imports: [ConfigModule],
    controllers: [RemoteController],
    providers: [RemoteServerService],
    exports: [RemoteServerService],
})
export class RemoteModule { }
