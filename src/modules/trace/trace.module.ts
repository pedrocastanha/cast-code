import { Module } from '@nestjs/common';
import { TraceContextService } from './services/trace-context.service';
import { TraceExportService } from './services/trace-export.service';
import { TraceReaderService } from './services/trace-reader.service';
import { TraceSanitizerService } from './services/trace-sanitizer.service';
import { TraceWriterService } from './services/trace-writer.service';

@Module({
  providers: [
    TraceContextService,
    TraceSanitizerService,
    TraceWriterService,
    TraceReaderService,
    TraceExportService,
  ],
  exports: [
    TraceContextService,
    TraceSanitizerService,
    TraceWriterService,
    TraceReaderService,
    TraceExportService,
  ],
})
export class TraceModule {}
