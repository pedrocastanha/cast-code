import { Injectable } from '@nestjs/common';
import type {
  BenchmarkHarnessPlan,
  BenchmarkModelOverridePoint,
  BenchmarkTargetCandidate,
} from '../types';

@Injectable()
export class BenchmarkHarnessPlannerService {
  plan(candidate: BenchmarkTargetCandidate, modelOverridePoints: BenchmarkModelOverridePoint[]): BenchmarkHarnessPlan {
    const hasUrl = typeof candidate.target.config.url === 'string' && candidate.target.config.url.length > 0;

    if (candidate.requiresWrite) {
      return this.build(candidate, 'wrapper_required', modelOverridePoints, {
        requiresWrite: true,
        confirmationRequired: true,
        controlledEnvironmentRecommended: true,
        reason: 'Target needs a generated wrapper or adapter before it can be benchmarked repeatably.',
      });
    }

    if (candidate.type === 'api_endpoint' && hasUrl) {
      return this.build(candidate, 'direct_http', modelOverridePoints, {
        requiresWrite: false,
        confirmationRequired: false,
        controlledEnvironmentRecommended: false,
        reason: 'Endpoint can be called over HTTP without modifying the project.',
      });
    }

    if (candidate.type === 'api_endpoint') {
      return this.build(candidate, 'start_command_http', modelOverridePoints, {
        requiresWrite: false,
        confirmationRequired: true,
        controlledEnvironmentRecommended: false,
        reason: 'Endpoint was found, but Cast needs a base URL or confirmed start command before running it.',
      });
    }

    if (candidate.type === 'agent_workflow') {
      return this.build(candidate, 'agent_workflow', modelOverridePoints, {
        requiresWrite: false,
        confirmationRequired: false,
        controlledEnvironmentRecommended: false,
        reason: 'Target can run through the active DeepAgent benchmark executor.',
      });
    }

    return this.build(candidate, 'unsupported', modelOverridePoints, {
      requiresWrite: false,
      confirmationRequired: false,
      controlledEnvironmentRecommended: false,
      reason: `Target type ${candidate.type} is discovered but its runner adapter is not enabled yet.`,
    });
  }

  private build(
    candidate: BenchmarkTargetCandidate,
    mode: BenchmarkHarnessPlan['mode'],
    modelOverridePoints: BenchmarkModelOverridePoint[],
    details: Pick<BenchmarkHarnessPlan, 'requiresWrite' | 'confirmationRequired' | 'controlledEnvironmentRecommended' | 'reason'>,
  ): BenchmarkHarnessPlan {
    return {
      candidateId: candidate.id,
      mode,
      targetType: candidate.type,
      target: candidate.target,
      modelOverridePoints,
      risk: details.requiresWrite ? 'medium' : candidate.risk,
      evidence: candidate.evidence,
      ...details,
    };
  }
}
