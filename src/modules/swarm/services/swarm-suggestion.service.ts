import { Injectable } from '@nestjs/common';
import type { SwarmSuggestion } from '../types';

const EXPLICIT_SWARM = /\b(agent\s*swarm|swarm|multi[- ]?agent|parallel\s+agents?|vários\s+agentes|multiplos\s+agentes)\b/i;
const PARALLEL_SIGNAL = /\b(across|between)\b.+\b(and|&)\b|\b(backend|api|server).+(frontend|web|ui|cli|test)/i;
const DIFFICULTY_SIGNAL = /\b(refactor|migrate|implement|rewrite|overhaul|end[- ]to[- ]end|full\s+stack)\b/i;
const SMALL_EDIT = /^\s*(fix|update|change|rename|typo|comment|format)\s+\w+/i;

@Injectable()
export class SwarmSuggestionService {
  evaluate(prompt: string): SwarmSuggestion {
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.length < 20) {
      return { shouldSuggest: false, reason: 'Prompt is too short for swarm decomposition.', confidence: 'low' };
    }

    if (SMALL_EDIT.test(trimmed) && trimmed.length < 120) {
      return { shouldSuggest: false, reason: 'Small focused edits should stay in the normal flow.', confidence: 'high' };
    }

    if (EXPLICIT_SWARM.test(trimmed)) {
      return {
        shouldSuggest: true,
        reason: 'You asked for multi-agent swarm execution.',
        confidence: 'high',
      };
    }

    if (PARALLEL_SIGNAL.test(trimmed) && DIFFICULTY_SIGNAL.test(trimmed)) {
      return {
        shouldSuggest: true,
        reason: 'The work spans independent surfaces and looks naturally parallelizable.',
        confidence: 'medium',
      };
    }

    if (DIFFICULTY_SIGNAL.test(trimmed) && trimmed.length > 180) {
      return {
        shouldSuggest: true,
        reason: 'The task looks large enough to benefit from decomposition and parallel workers.',
        confidence: 'medium',
      };
    }

    return { shouldSuggest: false, reason: 'Task does not meet swarm suggestion thresholds.', confidence: 'low' };
  }
}
