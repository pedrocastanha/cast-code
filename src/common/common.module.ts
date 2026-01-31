import { Module, Global } from '@nestjs/common';
import { MarkdownParserService } from './services/markdown-parser.service';

@Global()
@Module({
  providers: [MarkdownParserService],
  exports: [MarkdownParserService],
})
export class CommonModule {}
