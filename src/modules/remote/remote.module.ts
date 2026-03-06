import { Module } from '@nestjs/common';
import { RemoteServerService } from './services/remote-server.service';
import { ConfigModule } from '../config/config.module';

@Module({
    imports: [ConfigModule],
    providers: [RemoteServerService],
    exports: [RemoteServerService],
})
export class RemoteModule { }
