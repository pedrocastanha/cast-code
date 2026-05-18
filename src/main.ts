#!/usr/bin/env node
import 'reflect-metadata';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ReplService } from './modules/repl/services/repl.service';
import { ConfigManagerService } from './modules/config/services/config-manager.service';
import { InitConfigService } from './modules/config/services/init-config.service';
import { PlatformService } from './modules/platform/services/platform.service';
import { PlatformCommandsService } from './modules/repl/services/commands/platform-commands.service';
import { BenchmarkCommandsService } from './modules/benchmark/commands/benchmark-commands.service';
import { DeepAgentService } from './modules/core/services/deep-agent.service';
import { ScheduleCommandsService } from './modules/scheduler/commands/schedule-commands.service';

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

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function stripDirectScheduleFlags(args: string[]): string[] {
  const stripped: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--project-root') {
      index++;
      continue;
    }
    if (arg === '--background') {
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
}

function scheduleCommandNeedsAgent(args: string[]): boolean {
  const subcommand = (args[0] ?? 'overview').toLowerCase();
  if (subcommand === 'run' || subcommand === 'tick') {
    return true;
  }
  return subcommand === 'worker' && (args[1] ?? '').toLowerCase() === 'tick';
}

async function configureDirectScheduleRuntime(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  args: string[],
): Promise<void> {
  const configManager = app.get(ConfigManagerService);
  if (await configManager.configExists()) {
    await configManager.loadConfig();
  }

  if (!scheduleCommandNeedsAgent(args)) {
    return;
  }

  const deepAgent = app.get(DeepAgentService);
  await deepAgent.initialize();
  app.get(BenchmarkCommandsService).setAgentExecutor(deepAgent as any);
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'platform' || command === 'link') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    if (command === 'link') {
      console.warn('cast link was removed. Use: cast platform --project <id> --api-url <url>');
    }
    const platformCommands = app.get(PlatformCommandsService);
    const changed = await platformCommands.cmdPlatform(args.slice(1));
    await app.close();
    if (!changed && args[1] !== 'status') {
      process.exitCode = 1;
    }
    return;
  }

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

  if (command === 'schedule') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    try {
      const scheduleArgs = args.slice(1);
      const projectRoot = getFlag(scheduleArgs, '--project-root');
      if (projectRoot) {
        process.chdir(projectRoot);
      }
      const commandArgs = stripDirectScheduleFlags(scheduleArgs);
      await configureDirectScheduleRuntime(app, commandArgs);
      await app.get(ScheduleCommandsService).cmdSchedule(commandArgs);
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      console.error('\nFailed to run schedule command:\n', message);
      process.exitCode = 1;
    } finally {
      await app.close();
    }
    return;
  }

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

  const shutdown = async () => {
    await repl.shutdown();
    await app.get(PlatformService).close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
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
