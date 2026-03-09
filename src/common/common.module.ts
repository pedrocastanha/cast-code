import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { MultiLlmService } from './services/multi-llm.service';
import { ConfigService } from './services/config.service';
import { MarkdownRendererService } from './services/markdown-renderer.service';
import { ConfigModule } from '../modules/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MarkdownParserService, MultiLlmService, ConfigService, MarkdownRendererService],
  exports: [MarkdownParserService, MultiLlmService, ConfigService, MarkdownRendererService],
})
export class CommonModule {}
