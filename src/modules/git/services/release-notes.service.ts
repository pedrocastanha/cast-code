import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../../common/services/llm.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ReleaseNotesData {
  version: string;
  date: string;
  features: string[];
  accessibility: string[];
  notes: string[];
  library: string[];
  search: string[];
  bugfixes: string[];
  performance: string[];
  uiux: string[];
  breaking: string[];
  dependencies: string[];
  contributors: string[];
}

@Injectable()
export class ReleaseNotesService {
  constructor(private readonly llmService: LlmService) {}

  async generateReleaseNotes(
    sinceTag?: string,
    version?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string; content?: string }> {
    try {
      const cwd = process.cwd();
      
      // Get version
      const releaseVersion = version || this.detectVersion();
      
      // Get date
      const today = new Date();
      const dateStr = today.toLocaleDateString('pt-BR');
      const fileName = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}.md`;
      
      // Get commits since last tag
      const commits = this.getCommitsSince(sinceTag);
      
      // Get changed files
      const changedFiles = this.getChangedFiles(sinceTag);
      
      // Get package.json changes
      const dependencies = this.getDependencyChanges();
      
      // Generate AI summary
      const aiData = await this.generateAIAnalysis(commits, changedFiles);
      
      // Build release notes
      const notes = this.buildReleaseNotes({
        version: releaseVersion,
        date: dateStr,
        features: aiData.features,
        accessibility: aiData.accessibility,
        notes: aiData.notes,
        library: aiData.library,
        search: aiData.search,
        bugfixes: aiData.bugfixes,
        performance: aiData.performance,
        uiux: aiData.uiux,
        breaking: aiData.breaking,
        dependencies: dependencies.length > 0 ? dependencies : aiData.dependencies,
        contributors: this.getContributors(sinceTag),
      });
      
      // Ensure release directory exists
      const releaseDir = path.join(cwd, 'release');
      if (!fs.existsSync(releaseDir)) {
        fs.mkdirSync(releaseDir, { recursive: true });
      }
      
      // Write file
      const filePath = path.join(releaseDir, fileName);
      fs.writeFileSync(filePath, notes);
      
      return { success: true, filePath, content: notes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private detectVersion(): string {
    try {
      // Try package.json
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch {}
    
    // Try git tag
    try {
      const tag = execSync('git describe --tags --abbrev=0', { cwd: process.cwd(), encoding: 'utf-8' }).trim();
      return tag.replace(/^v/, '');
    } catch {}
    
    return '1.0.0';
  }

  private getCommitsSince(sinceTag?: string): string[] {
    try {
      const cwd = process.cwd();
      let cmd: string;
      
      if (sinceTag) {
        cmd = `git log ${sinceTag}..HEAD --pretty=format:"%H|%s|%an|%ad" --date=short`;
      } else {
        // Get last 30 commits
        cmd = `git log -30 --pretty=format:"%H|%s|%an|%ad" --date=short`;
      }
      
      const output = execSync(cmd, { cwd, encoding: 'utf-8' });
      return output.trim().split('\n').filter(l => l);
    } catch {
      return [];
    }
  }

  private getChangedFiles(sinceTag?: string): string[] {
    try {
      const cwd = process.cwd();
      const cmd = sinceTag 
        ? `git diff --name-only ${sinceTag}..HEAD`
        : `git diff --name-only HEAD~30..HEAD`;
      
      const output = execSync(cmd, { cwd, encoding: 'utf-8' });
      return output.trim().split('\n').filter(f => f);
    } catch {
      return [];
    }
  }

  private getDependencyChanges(): string[] {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      const changes: string[] = [];
      
      // Check if package-lock.json or yarn.lock changed
      const diff = execSync('git diff HEAD~5 package.json', { cwd: process.cwd(), encoding: 'utf-8' }).trim();
      
      if (diff.includes('"dependencies"') || diff.includes('"devDependencies"')) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, version] of Object.entries(deps).slice(0, 10)) {
          changes.push(`Atualizado \`${name}\` para \`${version}\``);
        }
      }
      
      return changes;
    } catch {
      return [];
    }
  }

  private getContributors(sinceTag?: string): string[] {
    try {
      const cwd = process.cwd();
      const cmd = sinceTag
        ? `git log ${sinceTag}..HEAD --pretty=format:"%an" | sort | uniq`
        : `git log -30 --pretty=format:"%an" | sort | uniq`;
      
      const output = execSync(cmd, { cwd, encoding: 'utf-8' });
      return output.trim().split('\n').filter(n => n).slice(0, 10);
    } catch {
      return [];
    }
  }

  private async generateAIAnalysis(commits: string[], changedFiles: string[]): Promise<Partial<ReleaseNotesData>> {
    const llm = this.llmService.createModel();
    
    const commitMessages = commits.map(c => {
      const parts = c.split('|');
      return parts[1] || c;
    }).join('\n');
    
    const prompt = `Analyze these commits and categorize them into release notes sections.

**Commits:**
${commitMessages.slice(0, 2000)}

**Changed Files:**
${changedFiles.slice(0, 20).join('\n')}

Categorize into these sections (return empty array if none):
- features: New features added
- accessibility: Accessibility improvements
- notes: General improvements and notes
- library: Library/organization features
- search: Search functionality changes
- bugfixes: Bug fixes
- performance: Performance optimizations
- uiux: UI/UX changes
- breaking: Breaking changes
- dependencies: Dependency updates

**OUTPUT FORMAT (JSON):**
\`\`\`json
{
  "features": ["Description of feature 1", "Description of feature 2"],
  "accessibility": [],
  "notes": [],
  "library": [],
  "search": [],
  "bugfixes": [],
  "performance": [],
  "uiux": [],
  "breaking": [],
  "dependencies": []
}
\`\`\``;

    try {
      const response = await llm.invoke([
        new SystemMessage('You are a technical writer creating release notes. Be concise and professional. Use Brazilian Portuguese.'),
        new HumanMessage(prompt),
      ]);

      const content = this.extractContent(response.content);
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          features: parsed.features || [],
          accessibility: parsed.accessibility || [],
          notes: parsed.notes || [],
          library: parsed.library || [],
          search: parsed.search || [],
          bugfixes: parsed.bugfixes || [],
          performance: parsed.performance || [],
          uiux: parsed.uiux || [],
          breaking: parsed.breaking || [],
          dependencies: parsed.dependencies || [],
        };
      }
    } catch {
      // Fallback to default empty arrays
    }

    return {
      features: [],
      accessibility: [],
      notes: [],
      library: [],
      search: [],
      bugfixes: [],
      performance: [],
      uiux: [],
      breaking: [],
      dependencies: [],
    };
  }

  private buildReleaseNotes(data: ReleaseNotesData): string {
    const sections: string[] = [];
    
    // Header
    sections.push(`# Notas de Versão - Versão ${data.version}`);
    sections.push('');
    sections.push(`**Data de Lançamento:** ${data.date}`);
    sections.push('');
    sections.push('---');
    sections.push('');
    
    // Features
    if (data.features.length > 0) {
      sections.push('## 📖 Recursos de Leitura');
      sections.push('');
      for (const item of data.features) {
        sections.push(`- **${this.extractFeatureName(item)}:** ${this.extractFeatureDesc(item)}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Accessibility
    if (data.accessibility.length > 0) {
      sections.push('## ♿ Acessibilidade');
      sections.push('');
      for (const item of data.accessibility) {
        sections.push(`- **Melhoria:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Notes
    if (data.notes.length > 0) {
      sections.push('## 📝 Anotações');
      sections.push('');
      for (const item of data.notes) {
        sections.push(`- **Aprimoramento:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Library
    if (data.library.length > 0) {
      sections.push('## 📚 Biblioteca');
      sections.push('');
      for (const item of data.library) {
        sections.push(`- **Adição:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Search
    if (data.search.length > 0) {
      sections.push('## 🔍 Busca');
      sections.push('');
      for (const item of data.search) {
        sections.push(`- **Melhoria:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Bugfixes
    if (data.bugfixes.length > 0) {
      sections.push('## 🐛 Correções de Bugs');
      sections.push('');
      for (const item of data.bugfixes) {
        sections.push(`- **Corrigido:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Performance
    if (data.performance.length > 0) {
      sections.push('## 🚀 Performance');
      sections.push('');
      for (const item of data.performance) {
        sections.push(`- **Otimização:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // UI/UX
    if (data.uiux.length > 0) {
      sections.push('## 🎨 UI/UX');
      sections.push('');
      for (const item of data.uiux) {
        sections.push(`- **Atualização:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Breaking Changes
    if (data.breaking.length > 0) {
      sections.push('## ⚠️ Mudanças Incompatíveis (Breaking Changes)');
      sections.push('');
      for (const item of data.breaking) {
        sections.push(`- **Mudança:** ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Dependencies
    if (data.dependencies.length > 0) {
      sections.push('## 📦 Dependências');
      sections.push('');
      for (const item of data.dependencies) {
        sections.push(`- ${item}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Contributors
    if (data.contributors.length > 0) {
      sections.push('## 🙏 Colaboradores');
      sections.push('');
      sections.push('Agradecimentos a todos os colaboradores que tornaram esta versão possível!');
      sections.push('');
      for (const contributor of data.contributors) {
        sections.push(`- @${contributor.toLowerCase().replace(/\s+/g, '')}`);
      }
      sections.push('');
      sections.push('---');
      sections.push('');
    }
    
    // Changelog link
    sections.push('## 📄 Changelog Completo');
    sections.push('');
    sections.push(`[Link para o changelog completo](https://github.com/sua-org/seu-repo/compare/v${data.version}...v${data.version})`);
    sections.push('');
    
    return sections.join('\n');
  }

  private extractFeatureName(item: string): string {
    const match = item.match(/^([^:]+):/);
    return match ? match[1].trim() : 'Novo Recurso';
  }

  private extractFeatureDesc(item: string): string {
    return item.replace(/^[^:]+:/, '').trim() || item;
  }

  private extractContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (typeof first === 'object' && first !== null && 'text' in first) {
        return String(first.text);
      }
    }
    return String(content);
  }
}
