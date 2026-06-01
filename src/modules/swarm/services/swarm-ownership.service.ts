import { Injectable } from '@nestjs/common';
import type { SwarmFileOwnership } from '../types';

@Injectable()
export class SwarmOwnershipService {
  matchesOwnership(relativePath: string, ownership: SwarmFileOwnership[]): boolean {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
    return ownership.some((entry) => this.globMatch(normalized, entry.glob));
  }

  private globMatch(path: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\.\//, '');
    const regex = new RegExp(`^${normalizedPattern
      .split('/')
      .map((segment) => {
        if (segment === '**') return '.*';
        return segment
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]');
      })
      .join('\\/')}$`);
    return regex.test(path) || path.startsWith(normalizedPattern.replace(/\*\*$/, ''));
  }
}
