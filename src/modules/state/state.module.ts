import { Module } from '@nestjs/common';
import { StateDbService } from './services/state-db.service';
import { StateMigrationService } from './services/state-migration.service';
import { StateRedactionService } from './services/state-redaction.service';
import { LocalSessionStoreService } from './services/local-session-store.service';

@Module({
  providers: [
    StateMigrationService,
    StateDbService,
    StateRedactionService,
    LocalSessionStoreService,
  ],
  exports: [
    StateDbService,
    StateRedactionService,
    LocalSessionStoreService,
  ],
})
export class StateModule {}
