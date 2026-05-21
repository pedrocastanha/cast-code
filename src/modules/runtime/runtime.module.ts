import { Module } from '@nestjs/common';
import { RuntimeTelemetryProjectorService } from './services/runtime-telemetry-projector.service';

@Module({
  providers: [RuntimeTelemetryProjectorService],
  exports: [RuntimeTelemetryProjectorService],
})
export class RuntimeModule {}
