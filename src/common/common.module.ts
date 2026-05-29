import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { LlmClientFactory } from './services/llm-client.factory';
import { ConfigService } from './services/config.service';
import { ConfigModule } from '../modules/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MarkdownParserService, LlmClientFactory, ConfigService],
  exports: [MarkdownParserService, LlmClientFactory, ConfigService],
})
export class CommonModule {}
