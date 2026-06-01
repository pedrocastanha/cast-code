import type { BridgeProviderId, BridgeToolManifest, BridgeUserTurn } from '../types/bridge.types';

export interface BridgeStartupFailure {
  kind: 'missing_command' | 'auth_required' | 'unknown';
  message: string;
}

export interface BridgeProviderAdapter {
  id: BridgeProviderId;
  label: string;
  defaultCommand(): string;
  defaultArgs(): string[];
  resetOutput?(): void;
  formatInput?(value: string): string;
  closeInputAfterWrite?(): boolean;
  requiresToolResultFollowup?(): boolean;
  buildHandshakePrompt(manifest: BridgeToolManifest): string;
  buildUserTurn(input: BridgeUserTurn): string;
  sanitizeOutput(chunk: string): string;
  classifyStartupFailure(output: string): BridgeStartupFailure | null;
}
