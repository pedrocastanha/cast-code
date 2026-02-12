import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { LlmService } from './services/llm.service';
import { ConfigService } from './services/config.service';

@Global()
@Module({
  providers: [MarkdownParserService, LlmService, ConfigService],
  exports: [MarkdownParserService, LlmService, ConfigService],
})
export class CommonModule {}
