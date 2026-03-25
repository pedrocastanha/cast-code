import 'reflect-metadata';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ReplService } from './modules/repl/services/repl.service';
import { ConfigManagerService } from './modules/config/services/config-manager.service';
import { InitConfigService } from './modules/config/services/init-config.service';
import { BridgeCommandsService } from './modules/repl/services/commands/bridge-commands.service';

config({ quiet: true });

async function checkAndRunSetup(
  configManager: ConfigManagerService,
  initService: InitConfigService,
): Promise<boolean> {
  const hasConfig = await configManager.configExists();

  if (!hasConfig) {
    console.log('\n👋 Bem-vindo ao Cast Code!\n');
    console.log('Parece que esta é a primeira vez que você executa o Cast.');
    console.log('Vamos fazer a configuração inicial agora.\n');

    try {
      await initService.runInitialSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Falha na configuração inicial: ${message}\n`);
      return false;
    }

    const created = await configManager.configExists();
    if (!created) {
      console.log('\n⚠️  Configuração não concluída. Rode: cast config init\n');
      return false;
    }

    return true;
  }

  return true;
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle bridge command separately - it doesn't need the REPL
  if (command === 'bridge') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    const configManager = app.get(ConfigManagerService);
    const initService = app.get(InitConfigService);
    const ready = await checkAndRunSetup(configManager, initService);

    if (!ready) {
      await app.close();
      process.exit(1);
    }

    const bridgeCommands = app.get(BridgeCommandsService);
    const bridgeArgs = args.slice(1);

    try {
      await bridgeCommands.startBridge(bridgeArgs);
      
      // Keep process alive while bridge is running
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          bridgeCommands.stopBridge().then(() => {
            resolve();
          });
        });
        process.on('SIGTERM', () => {
          bridgeCommands.stopBridge().then(() => {
            resolve();
          });
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      console.error('\nBridge error:\n', message);
      process.exitCode = 1;
    }

    await app.close();
    return;
  }

  // Handle config/init commands
  if (command === 'config' || command === 'init') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    const configCommands = app.get(InitConfigService);
    try {
      await configCommands.runInitialSetup();
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      console.error('\nFailed to run initial setup:\n', message);
      process.exitCode = 1;
    }
    await app.close();
    return;
  }

  // Normal REPL execution
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const configManager = app.get(ConfigManagerService);
  const initService = app.get(InitConfigService);

  const ready = await checkAndRunSetup(configManager, initService);

  if (!ready) {
    await app.close();
    process.exit(1);
  }

  await configManager.loadConfig();

  const repl = app.get(ReplService);

  process.on('SIGINT', () => {
    repl.stop();
    app.close();
    process.exit(0);
  });

  try {
    await repl.start();
  } catch (error) {
    console.error('Failed to start:', (error as Error).message);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  console.error('\nFatal bootstrap error:\n', message);
  process.exit(1);
});
