import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { LlmService } from './services/llm.service';
import { MultiLlmService } from './services/multi-llm.service';
import { ConfigService } from './services/config.service';
import { MarkdownRendererService } from './services/markdown-renderer.service';
import { ConfigModule } from '../modules/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MarkdownParserService, LlmService, MultiLlmService, ConfigService, MarkdownRendererService],
  exports: [MarkdownParserService, LlmService, MultiLlmService, ConfigService, MarkdownRendererService],
})
export class CommonModule {}
