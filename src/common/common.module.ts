import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { LlmService } from './services/llm.service';
import { ConfigService } from './services/config.service';
import { MarkdownRendererService } from './services/markdown-renderer.service';

@Global()
@Module({
  providers: [MarkdownParserService, LlmService, ConfigService, MarkdownRendererService],
  exports: [MarkdownParserService, LlmService, ConfigService, MarkdownRendererService],
})
export class CommonModule {}
