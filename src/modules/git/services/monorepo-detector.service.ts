import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MonorepoInfo } from '../types/git.types';

@Injectable()
export class MonorepoDetectorService {
  detectMonorepo(repoPath: string): MonorepoInfo {
    const modules: string[] = [];
    const moduleMapping: Record<string, string> = {};

    const patterns = [
      { dir: 'packages', type: 'package' },
      { dir: 'apps', type: 'app' },
      { dir: 'modules', type: 'module' },
      { dir: 'src/modules', type: 'module' },
      { dir: 'projects', type: 'project' },
      { dir: 'libs', type: 'lib' },
      { dir: 'services', type: 'service' },
      { dir: 'frontend', type: 'frontend' },
      { dir: 'backend', type: 'backend' },
      { dir: 'api', type: 'api' },
      { dir: 'web', type: 'web' },
      { dir: 'mobile', type: 'mobile' },
    ];

    for (const { dir, type } of patterns) {
      const fullPath = path.join(repoPath, dir);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const subdirs = fs
          .readdirSync(fullPath, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
          .map((d) => d.name);

        if (subdirs.length > 0) {
          for (const subdir of subdirs) {
            const moduleName = this.inferModuleName(dir, subdir, type);
            if (!modules.includes(moduleName)) {
              modules.push(moduleName);
            }
            moduleMapping[path.join(dir, subdir)] = moduleName;
          }
        } else {
          const moduleName = path.basename(dir);
          if (!modules.includes(moduleName)) {
            modules.push(moduleName);
          }
          moduleMapping[dir] = moduleName;
        }
      }
    }

    const workspaceFile = this.findWorkspaceFile(repoPath);
    if (workspaceFile) {
      const workspaceModules = this.parseWorkspaceFile(workspaceFile, repoPath);
      for (const mod of workspaceModules) {
        if (!modules.includes(mod)) {
          modules.push(mod);
        }
      }
    }

    const nxConfig = path.join(repoPath, 'nx.json');
    if (fs.existsSync(nxConfig)) {
      try {
        const nxData = JSON.parse(fs.readFileSync(nxConfig, 'utf-8'));
        if (nxData.projects) {
          for (const [projectName, projectPath] of Object.entries(nxData.projects)) {
            if (typeof projectPath === 'string') {
              if (!modules.includes(projectName)) {
                modules.push(projectName);
              }
              moduleMapping[projectPath] = projectName;
            }
          }
        }
      } catch {
        // Ignore parsing errors
      }
    }

    return {
      isMonorepo: modules.length > 0,
      rootDir: repoPath,
      modules,
      moduleMapping,
    };
  }

  determineScope(files: string[], monorepoInfo: MonorepoInfo): string | undefined {
    if (!monorepoInfo.isMonorepo || files.length === 0) {
      return undefined;
    }

    const scopes = new Set<string>();

    for (const file of files) {
      const scope = this.findModuleForFile(file, monorepoInfo);
      if (scope) {
        scopes.add(scope);
      }
    }

    if (scopes.size === 1) {
      return Array.from(scopes)[0];
    }

    if (scopes.size > 1) {
      return this.findCommonScope(Array.from(scopes));
    }

    return undefined;
  }

  private inferModuleName(parentDir: string, subdir: string, type: string): string {
    const normalized = subdir.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (['api', 'web', 'mobile', 'frontend', 'backend', 'admin', 'core', 'shared'].includes(normalized)) {
      return normalized;
    }

    if (parentDir === 'src/modules') {
      return normalized;
    }

    return normalized;
  }

  private findModuleForFile(file: string, monorepoInfo: MonorepoInfo): string | undefined {
    for (const [modulePath, moduleName] of Object.entries(monorepoInfo.moduleMapping)) {
      if (file.startsWith(modulePath + '/') || file === modulePath) {
        return moduleName;
      }
    }

    const patterns = [
      /^packages\/([^/]+)/,
      /^apps\/([^/]+)/,
      /^modules\/([^/]+)/,
      /^src\/modules\/([^/]+)/,
      /^projects\/([^/]+)/,
      /^libs\/([^/]+)/,
      /^services\/([^/]+)/,
      /^([^/]+)\/src/,
    ];

    for (const pattern of patterns) {
      const match = file.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  private findCommonScope(scopes: string[]): string | undefined {
    if (scopes.length === 0) return undefined;
    if (scopes.length === 1) return scopes[0];

    const first = scopes[0];
    let common = first;

    for (const scope of scopes.slice(1)) {
      while (!scope.startsWith(common) && common.length > 0) {
        common = common.slice(0, -1);
      }
    }

    common = common.replace(/[-_/]+$/, '');

    if (common.length < 2 || ['src', 'lib', 'app'].includes(common)) {
      return undefined;
    }

    return common || undefined;
  }

  private findWorkspaceFile(repoPath: string): string | null {
    const files = ['pnpm-workspace.yaml', 'pnpm-workspace.yml', 'lerna.json'];

    for (const file of files) {
      const fullPath = path.join(repoPath, file);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    const packageJson = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
        if (pkg.workspaces) {
          return packageJson;
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  private parseWorkspaceFile(filePath: string, repoPath: string): string[] {
    const modules: string[] = [];

    try {
      if (filePath.endsWith('pnpm-workspace.yaml') || filePath.endsWith('pnpm-workspace.yml')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/packages:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
        if (match) {
          const lines = match[1].split('\n');
          for (const line of lines) {
            const pkgMatch = line.match(/-\s*['"]?([^'"\n]+)['"]?/);
            if (pkgMatch) {
              const pattern = pkgMatch[1].replace('/*', '');
              const fullPath = path.join(repoPath, pattern);
              if (fs.existsSync(fullPath)) {
                const subdirs = fs
                  .readdirSync(fullPath, { withFileTypes: true })
                  .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                  .map((d) => d.name);
                modules.push(...subdirs);
              }
            }
          }
        }
      } else if (filePath.endsWith('package.json')) {
        const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const workspaces = pkg.workspaces;
        if (Array.isArray(workspaces)) {
          for (const pattern of workspaces) {
            const dir = pattern.replace('/*', '');
            const fullPath = path.join(repoPath, dir);
            if (fs.existsSync(fullPath)) {
              const subdirs = fs
                .readdirSync(fullPath, { withFileTypes: true })
                .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                .map((d) => d.name);
              modules.push(...subdirs);
            }
          }
        } else if (workspaces?.packages) {
          for (const pattern of workspaces.packages) {
            const dir = pattern.replace('/*', '');
            const fullPath = path.join(repoPath, dir);
            if (fs.existsSync(fullPath)) {
              const subdirs = fs
                .readdirSync(fullPath, { withFileTypes: true })
                .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                .map((d) => d.name);
              modules.push(...subdirs);
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return modules;
  }
}
