import { Global, Module } from '@nestjs/common';
import { CapabilityRegistryService } from './capability-registry.service';

@Global()
@Module({
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class CapabilitiesModule {}
