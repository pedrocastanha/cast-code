import { Injectable } from '@nestjs/common';

export type BenchmarkWriteDecision = 'controlled' | 'current_project' | 'cancel';

@Injectable()
export class BenchmarkSandboxDecisionService {
  writeConfirmationChoices(): Array<{ key: BenchmarkWriteDecision; label: string; description: string }> {
    return [
      {
        key: 'controlled',
        label: 'Controlled environment',
        description: 'recommended; create wrapper in isolated benchmark workspace',
      },
      {
        key: 'current_project',
        label: 'Current project',
        description: 'write the wrapper in this repository after confirmation',
      },
      {
        key: 'cancel',
        label: 'Cancel',
        description: 'do not create files',
      },
    ];
  }
}
