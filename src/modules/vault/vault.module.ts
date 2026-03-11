import { Module } from '@nestjs/common';
import { VaultService } from './services/vault.service';

@Module({
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
