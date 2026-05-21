import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';
import { MultiLlmService } from './services/multi-llm.service';
import { ConfigService } from './services/config.service';
import { ConfigModule } from '../modules/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MarkdownParserService, MultiLlmService, ConfigService],
  exports: [MarkdownParserService, MultiLlmService, ConfigService],
})
export class CommonModule {}
