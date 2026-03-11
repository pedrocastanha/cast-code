import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ImpactResult {
  targetFile: string;
  importers: string[];
  exportedSymbols: string[];
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

@Injectable()
export class ImpactAnalysisService {
  analyze(filePath: string): ImpactResult {
    const absPath = path.resolve(filePath);
    const relPath = path.relative(process.cwd(), absPath);

    const importers = this.findImporters(relPath, absPath);
    const exportedSymbols = this.findExports(absPath);
    const riskLevel: ImpactResult['riskLevel'] =
      importers.length > 10 ? 'high' : importers.length > 3 ? 'medium' : 'low';

    const lines: string[] = [
      `File: ${relPath}`,
      `Exported symbols (${exportedSymbols.length}): ${exportedSymbols.length > 0 ? exportedSymbols.slice(0, 8).join(', ') + (exportedSymbols.length > 8 ? '...' : '') : 'none detected'}`,
      `Imported by: ${importers.length} file(s)`,
    ];

    if (importers.length > 0) {
      lines.push('Importers:');
      importers.slice(0, 15).forEach(i => lines.push(`  - ${i}`));
      if (importers.length > 15) lines.push(`  ... and ${importers.length - 15} more`);
    }

    lines.push(`Risk level: ${riskLevel.toUpperCase()}`);
    if (riskLevel !== 'low') {
      lines.push(`⚠️  Changes to this file will affect ${importers.length} dependent file(s). Review carefully before editing.`);
    } else {
      lines.push('✓ Low impact — few or no dependents. Safe to modify.');
    }

    return {
      targetFile: relPath,
      importers,
      exportedSymbols,
      riskLevel,
      summary: lines.join('\n'),
    };
  }

  private findImporters(relPath: string, absPath: string): string[] {
    const results = new Set<string>();
    const basename = path.basename(relPath, path.extname(relPath));
    const searchTerms = [
      basename,
      relPath.replace(/\.(ts|tsx|js|jsx)$/, ''),
      relPath,
    ];

    for (const term of searchTerms) {
      try {
        const output = execSync(
          `grep -rl "${term}" src/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null || true`,
          { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }
        ).trim();
        output.split('\n').filter(Boolean).forEach(f => {
          if (f !== relPath && path.resolve(f) !== absPath) results.add(f);
        });
      } catch {}
    }
    return Array.from(results).slice(0, 25);
  }

  private findExports(absPath: string): string[] {
    if (!fs.existsSync(absPath)) return [];
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const exports: string[] = [];

      // Named exports: export class Foo, export function bar, export const baz, etc.
      const namedPattern = /^export\s+(?:default\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|let|var|enum)\s+(\w+)/gm;
      let match: RegExpExecArray | null;
      while ((match = namedPattern.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // Re-exports: export { Foo, Bar }
      const reExportPattern = /^export\s*\{([^}]+)\}/gm;
      while ((match = reExportPattern.exec(content)) !== null) {
        match[1].split(',').forEach(s => {
          const name = s.trim().split(/\s+as\s+/)[0].trim();
          if (name && name !== '*') exports.push(name);
        });
      }

      return [...new Set(exports)].slice(0, 20);
    } catch {
      return [];
    }
  }
}
