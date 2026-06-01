import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NestFactory } from '@nestjs/core';

import { StateModule } from './state.module';
import { LocalSessionStoreService } from './services/local-session-store.service';

describe('StateModule', () => {
  test('resolves local session store from a Nest application context', async () => {
    const context = await NestFactory.createApplicationContext(StateModule, { logger: false });
    try {
      const store = context.get(LocalSessionStoreService);
      assert(store instanceof LocalSessionStoreService);
    } finally {
      await context.close();
    }
  });
});
