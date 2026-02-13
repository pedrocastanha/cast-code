#!/usr/bin/env node
import 'reflect-metadata';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ReplService } from './modules/repl/services/repl.service';
import { ConfigManagerService } from './modules/config/services/config-manager.service';
import { InitConfigService } from './modules/config/services/init-config.service';

// Load .env file
config();

async function checkAndRunSetup(configManager: ConfigManagerService, initService: InitConfigService): Promise<boolean> {
  const hasConfig = await configManager.configExists();
  
  if (!hasConfig) {
    console.log('\n👋 Bem-vindo ao Cast Code!\n');
    console.log('Parece que esta é a primeira vez que você executa o Cast.');
    console.log('Vamos fazer a configuração inicial?\n');
    
    // Import inquirer dynamically to avoid issues if not needed
    const { confirm } = await import('@inquirer/prompts');
    
    const shouldSetup = await confirm({
      message: 'Deseja configurar agora?',
      default: true,
    });
    
    if (shouldSetup) {
      await initService.runInitialSetup();
      return true;
    } else {
      console.log('\n⚠️  Você pode configurar depois rodando: cast config init\n');
      console.log('Por enquanto, você precisa definir a variável OPENAI_API_KEY no ambiente.\n');
      return false;
    }
  }
  
  return true;
}

async function bootstrap() {
  // Special commands that don't need full bootstrap
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'config' || command === 'init') {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    
    const configCommands = app.get(InitConfigService);
    await configCommands.runInitialSetup();
    await app.close();
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const configManager = app.get(ConfigManagerService);
  const initService = app.get(InitConfigService);
  
  // Check if config exists
  const ready = await checkAndRunSetup(configManager, initService);
  
  if (!ready) {
    await app.close();
    process.exit(1);
  }

  // Load config
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

bootstrap();
