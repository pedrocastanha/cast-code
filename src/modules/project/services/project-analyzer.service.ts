import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

// Language configurations
interface LanguageConfig {
  name: string;
  extensions: string[];
  configFiles: string[];
  entryPatterns: string[];
  importPatterns: RegExp[];
  commentPatterns: { single?: string; multi?: [string, string] };
}

const LANGUAGES: Record<string, LanguageConfig> = {
  typescript: {
    name: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    configFiles: ['tsconfig.json'],
    entryPatterns: ['src/main.ts', 'src/index.ts', 'index.ts', 'main.ts'],
    importPatterns: [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /import\s*\(['"]([^'"]+)['"]\)/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  javascript: {
    name: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs'],
    configFiles: ['package.json', '.eslintrc.js'],
    entryPatterns: ['src/main.js', 'src/index.js', 'index.js', 'main.js', 'app.js'],
    importPatterns: [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  python: {
    name: 'Python',
    extensions: ['.py'],
    configFiles: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    entryPatterns: ['main.py', 'app.py', 'src/main.py', '__main__.py', 'manage.py'],
    importPatterns: [
      /(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
    ],
    commentPatterns: { single: '#', multi: ['"""', '"""'] },
  },
  go: {
    name: 'Go',
    extensions: ['.go'],
    configFiles: ['go.mod', 'go.sum'],
    entryPatterns: ['main.go', 'cmd/main.go', 'src/main.go'],
    importPatterns: [
      /import\s+\(\s*([^)]+)\)/g,
      /import\s+['"]([^'"]+)['"]/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    configFiles: ['Cargo.toml', 'Cargo.lock'],
    entryPatterns: ['src/main.rs', 'src/lib.rs', 'main.rs'],
    importPatterns: [
      /use\s+([a-zA-Z_][a-zA-Z0-9_:]*)/g,
      /extern\s+crate\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  java: {
    name: 'Java',
    extensions: ['.java'],
    configFiles: ['pom.xml', 'build.gradle', 'gradlew'],
    entryPatterns: ['src/main/java/Main.java', 'src/Main.java', 'Main.java'],
    importPatterns: [
      /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  php: {
    name: 'PHP',
    extensions: ['.php'],
    configFiles: ['composer.json', 'composer.lock'],
    entryPatterns: ['index.php', 'public/index.php', 'src/index.php'],
    importPatterns: [
      /use\s+([a-zA-Z_][a-zA-Z0-9_\\]*)/g,
      /require(?:_once)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /include(?:_once)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
  ruby: {
    name: 'Ruby',
    extensions: ['.rb'],
    configFiles: ['Gemfile', 'Gemfile.lock', '*.gemspec'],
    entryPatterns: ['main.rb', 'app.rb', 'config.ru', 'bin/'],
    importPatterns: [
      /require\s+['"]([^'"]+)['"]/g,
      /require_relative\s+['"]([^'"]+)['"]/g,
    ],
    commentPatterns: { single: '#' },
  },
  csharp: {
    name: 'C#',
    extensions: ['.cs'],
    configFiles: ['*.csproj', '*.sln'],
    entryPatterns: ['Program.cs', 'Main.cs', 'Startup.cs'],
    importPatterns: [
      /using\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g,
    ],
    commentPatterns: { single: '//', multi: ['/*', '*/'] },
  },
};

// Architecture patterns detection
const ARCHITECTURE_PATTERNS = [
  {
    name: 'Layered Architecture',
    indicators: ['controllers', 'services', 'repositories', 'models', 'dao'],
    description: 'Separação em camadas: apresentação, negócio, dados',
  },
  {
    name: 'Clean Architecture',
    indicators: ['entities', 'usecases', 'adapters', 'frameworks', 'interfaces'],
    description: 'Independência de frameworks, testável, independente de UI e banco',
  },
  {
    name: 'Hexagonal Architecture (Ports & Adapters)',
    indicators: ['ports', 'adapters', 'domain', 'application'],
    description: 'Domínio no centro, adaptadores externos plugáveis',
  },
  {
    name: 'Microservices',
    indicators: ['services/', 'api/', 'gateway', 'proto/', 'grpc'],
    description: 'Serviços independentes, comunicação via API/mensagens',
  },
  {
    name: 'Serverless',
    indicators: ['functions/', 'handlers/', 'lambda', 'serverless.yml'],
    description: 'Funções como unidade de deployment, event-driven',
  },
  {
    name: 'Modular Monolith',
    indicators: ['modules/', 'bounded-contexts', 'packages/'],
    description: 'Monolito dividido em módulos bem definidos',
  },
  {
    name: 'Domain-Driven Design (DDD)',
    indicators: ['domain/', 'aggregates', 'value-objects', 'entities', 'domain-events'],
    description: 'Modelagem focada no domínio de negócio',
  },
  {
    name: 'CQRS',
    indicators: ['commands/', 'queries/', 'handlers/', 'read-model', 'write-model'],
    description: 'Separação de leitura e escrita',
  },
  {
    name: 'Event Sourcing',
    indicators: ['events/', 'event-store', 'projections', 'aggregates'],
    description: 'Estado derivado de uma sequência de eventos',
  },
  {
    name: 'MVC/MVP/MVVM',
    indicators: ['views/', 'viewmodels', 'presenters', 'controllers'],
    description: 'Separação de concerns de UI',
  },
];

// Pattern roles based on file/directory names
const PATTERN_ROLES: Record<string, string> = {
  // Controllers
  controller: 'Controlador - Recebe requisições, delega processamento',
  handler: 'Handler - Processa requisições/eventos',
  resource: 'Resource - Endpoints REST',
  router: 'Router - Define rotas',
  route: 'Route - Configuração de rota',
  
  // Services
  service: 'Serviço - Lógica de negócio',
  usecase: 'Caso de Uso - Orquestra operação específica',
  interactor: 'Interactor - Coordena fluxo de dados',
  
  // Data
  repository: 'Repositório - Acesso a dados',
  dao: 'DAO - Data Access Object',
  model: 'Modelo - Entidade/Modelo de dados',
  entity: 'Entidade - Objeto de domínio',
  schema: 'Schema - Definição de estrutura de dados',
  migration: 'Migration - Alteração de banco de dados',
  
  // Domain
  aggregate: 'Aggregate - Raiz de agregação DDD',
  valueobject: 'Value Object - Objeto de valor imutável',
  domainevent: 'Domain Event - Evento de domínio',
  
  // Infrastructure
  adapter: 'Adapter - Adapta interface externa',
  gateway: 'Gateway - Interface para sistema externo',
  client: 'Client - Cliente HTTP/API',
  provider: 'Provider - Provedor de serviço/dependência',
  
  // Configuration
  config: 'Configuração - Setup e configurações',
  settings: 'Settings - Configurações do projeto',
  env: 'Environment - Variáveis de ambiente',
  
  // Utils
  utils: 'Utilitários - Funções auxiliares',
  helpers: 'Helpers - Funções de apoio',
  common: 'Common - Código compartilhado',
  shared: 'Shared - Recursos compartilhados',
  lib: 'Library - Biblioteca interna',
  
  // Testing
  test: 'Teste - Testes unitários/integração',
  spec: 'Spec - Especificação/teste',
  mock: 'Mock - Simulação para testes',
  fixture: 'Fixture - Dados de teste',
  
  // UI
  component: 'Componente - Componente de UI',
  page: 'Page - Página da aplicação',
  layout: 'Layout - Template de layout',
  style: 'Style - Estilos CSS/styled',
  
  // Events
  event: 'Event - Definição de evento',
  listener: 'Listener - Ouvinte de evento',
  subscriber: 'Subscriber - Assinante de evento',
  producer: 'Producer - Produtor de evento',
  consumer: 'Consumer - Consumidor de evento/mensagem',
  
  // Middleware
  middleware: 'Middleware - Interceptador de requisições',
  guard: 'Guard - Proteção de rotas/recursos',
  interceptor: 'Interceptor - Intercepta execução',
  filter: 'Filter - Filtro de dados/requisições',
  pipe: 'Pipe - Transformação de dados',
  decorator: 'Decorator - Decorador/annotation',
  
  // Jobs/Background
  job: 'Job - Tarefa em background',
  worker: 'Worker - Processador de tarefas',
  queue: 'Queue - Fila de processamento',
  schedule: 'Schedule - Tarefa agendada',
  cron: 'Cron - Job periódico',
  
  // API
  dto: 'DTO - Data Transfer Object',
  request: 'Request - Objeto de requisição',
  response: 'Response - Objeto de resposta',
  serializer: 'Serializer - Serialização de dados',
  validator: 'Validator - Validação de dados',
};

export interface ProjectContext {
  name: string;
  objective: string;
  description: string;
  primaryLanguage: string;
  languages: string[];
  architecture?: {
    pattern: string;
    description: string;
    confidence: 'high' | 'medium' | 'low';
  };
  structure: {
    root: string;
    directories: string[];
    entryPoints: string[];
  };
  modules: Array<{
    name: string;
    path: string;
    role: string;
    fileCount: number;
    keyFiles: string[];
  }>;
  dependencies: {
    internal: string[];
    external: string[];
  };
  conventions: {
    naming: string;
    testing: boolean;
    linting: boolean;
  };
  rawData: {
    allFiles: string[];
    configFiles: string[];
  };
}

@Injectable()
export class ProjectAnalyzerService {
  
  async analyze(projectPath: string = process.cwd()): Promise<ProjectContext> {
    const name = path.basename(projectPath);
    
    // Detect languages used
    const languages = await this.detectLanguages(projectPath);
    const primaryLanguage = languages[0] || 'unknown';
    
    // Get structure
    const structure = await this.analyzeStructure(projectPath, primaryLanguage);
    
    // Detect architecture
    const architecture = await this.detectArchitecture(projectPath, structure.directories);
    
    // Analyze modules
    const modules = await this.analyzeModules(projectPath, structure.directories);
    
    // Get dependencies
    const dependencies = await this.getDependencies(projectPath, primaryLanguage);
    
    // Detect conventions
    const conventions = await this.detectConventions(projectPath);
    
    // Get all files for raw data
    const allFiles = await this.getAllFiles(projectPath, languages);
    const configFiles = await this.getConfigFiles(projectPath);
    
    // Generate descriptions
    const objective = this.generateObjective(name, primaryLanguage, architecture);
    const description = this.generateDescription(name, primaryLanguage, architecture, modules.length);
    
    return {
      name,
      objective,
      description,
      primaryLanguage,
      languages,
      architecture,
      structure,
      modules,
      dependencies,
      conventions,
      rawData: {
        allFiles,
        configFiles,
      },
    };
  }
  
  private async detectLanguages(projectPath: string): Promise<string[]> {
    const languages: string[] = [];
    const counts: Record<string, number> = {};
    
    for (const [key, config] of Object.entries(LANGUAGES)) {
      try {
        const files = await glob(`**/*{${config.extensions.join(',')}}`, { 
          cwd: projectPath,
          nodir: true,
          ignore: ['node_modules/**', '**/node_modules/**', '.git/**', 'dist/**', 'build/**', 'target/**'],
        });
        if (files.length > 0) {
          counts[key] = files.length;
        }
      } catch {}
    }
    
    // Sort by count descending
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  }
  
  private async analyzeStructure(projectPath: string, primaryLanguage: string): Promise<ProjectContext['structure']> {
    const langConfig = LANGUAGES[primaryLanguage];
    const directories: string[] = [];
    const entryPoints: string[] = [];
    
    // Common source directories
    const commonDirs = ['src', 'lib', 'app', 'source', 'core', 'packages', 'internal', 'cmd', 'pkg'];
    
    for (const dir of commonDirs) {
      try {
        const stat = await fs.stat(path.join(projectPath, dir));
        if (stat.isDirectory()) {
          directories.push(dir);
        }
      } catch {}
    }
    
    // Find entry points based on language
    if (langConfig) {
      for (const pattern of langConfig.entryPatterns) {
        try {
          await fs.access(path.join(projectPath, pattern));
          entryPoints.push(pattern);
        } catch {}
      }
    }
    
    return {
      root: projectPath,
      directories,
      entryPoints,
    };
  }
  
  private async detectArchitecture(
    projectPath: string, 
    directories: string[]
  ): Promise<ProjectContext['architecture'] | undefined> {
    const dirSet = new Set(directories.map(d => d.toLowerCase()));
    const allDirs = await this.getAllDirectories(projectPath);
    const allDirsLower = allDirs.map(d => d.toLowerCase());
    
    let bestMatch: { pattern: typeof ARCHITECTURE_PATTERNS[0]; count: number } | null = null;
    
    for (const pattern of ARCHITECTURE_PATTERNS) {
      const matchingIndicators = pattern.indicators.filter(indicator => 
        allDirsLower.some(dir => dir.includes(indicator.toLowerCase()))
      );
      
      if (matchingIndicators.length > 0) {
        if (!bestMatch || matchingIndicators.length > bestMatch.count) {
          bestMatch = { pattern, count: matchingIndicators.length };
        }
      }
    }
    
    if (bestMatch) {
      const confidence = bestMatch.count >= 3 ? 'high' : bestMatch.count >= 2 ? 'medium' : 'low';
      return {
        pattern: bestMatch.pattern.name,
        description: bestMatch.pattern.description,
        confidence,
      };
    }
    
    return undefined;
  }
  
  private async analyzeModules(projectPath: string, directories: string[]): Promise<ProjectContext['modules']> {
    const modules: ProjectContext['modules'] = [];
    
    for (const dir of directories) {
      const dirPath = path.join(projectPath, dir);
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
            const modulePath = path.join(dirPath, entry.name);
            const files = await this.getFilesInDir(modulePath);
            const keyFiles = files.slice(0, 5);
            
            // Detect role based on name
            const role = this.detectRole(entry.name);
            
            modules.push({
              name: entry.name,
              path: path.join(dir, entry.name),
              role,
              fileCount: files.length,
              keyFiles,
            });
          }
        }
      } catch {}
    }
    
    return modules.sort((a, b) => b.fileCount - a.fileCount);
  }
  
  private detectRole(dirName: string): string {
    const lower = dirName.toLowerCase();
    
    for (const [pattern, role] of Object.entries(PATTERN_ROLES)) {
      if (lower.includes(pattern)) {
        return role;
      }
    }
    
    // Default based on common patterns
    if (['auth', 'authentication', 'security'].some(p => lower.includes(p))) {
      return 'Autenticação e autorização';
    }
    if (['user', 'users', 'account', 'accounts'].some(p => lower.includes(p))) {
      return 'Gestão de usuários/contas';
    }
    if (['payment', 'billing', 'finance', 'subscription'].some(p => lower.includes(p))) {
      return 'Pagamentos e faturamento';
    }
    if (['notification', 'email', 'sms', 'push'].some(p => lower.includes(p))) {
      return 'Notificações';
    }
    if (['api', 'rest', 'graphql', 'grpc'].some(p => lower.includes(p))) {
      return 'API/Interface externa';
    }
    if (['db', 'database', 'storage', 'cache'].some(p => lower.includes(p))) {
      return 'Persistência de dados';
    }
    if (['queue', 'job', 'worker', 'background'].some(p => lower.includes(p))) {
      return 'Processamento em background';
    }
    if (['frontend', 'web', 'ui', 'mobile', 'app'].some(p => lower.includes(p))) {
      return 'Interface do usuário';
    }
    
    return 'Funcionalidade específica do domínio';
  }
  
  private async getDependencies(
    projectPath: string, 
    language: string
  ): Promise<ProjectContext['dependencies']> {
    const internal: string[] = [];
    const external: string[] = [];
    
    // Language-specific dependency detection
    switch (language) {
      case 'typescript':
      case 'javascript':
        try {
          const pkg = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8'));
          const allDeps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
          };
          
          for (const [name, version] of Object.entries(allDeps)) {
            if (name.startsWith('@') && name.includes('/')) {
              // Scoped packages - check if internal
              const scope = name.split('/')[0];
              if (scope === `@${pkg.name}` || name.startsWith('@internal')) {
                internal.push(name);
              } else {
                external.push(name);
              }
            } else {
              external.push(name);
            }
          }
        } catch {}
        break;
        
      case 'python':
        try {
          const requirements = await fs.readFile(path.join(projectPath, 'requirements.txt'), 'utf-8');
          external.push(...requirements
            .split('\n')
            .map(line => line.split('==')[0].split('>=')[0].trim())
            .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
          );
        } catch {}
        break;
        
      case 'go':
        try {
          const modContent = await fs.readFile(path.join(projectPath, 'go.mod'), 'utf-8');
          const matches = modContent.match(/require\s+\(([^)]+)\)/s);
          if (matches) {
            external.push(...matches[1]
              .split('\n')
              .map(line => line.trim().split(' ')[0])
              .filter(line => line && !line.startsWith('//'))
            );
          }
        } catch {}
        break;
        
      case 'rust':
        try {
          const cargo = await fs.readFile(path.join(projectPath, 'Cargo.toml'), 'utf-8');
          const matches = cargo.match(/\[dependencies\]([^\[]+)/);
          if (matches) {
            external.push(...matches[1]
              .split('\n')
              .map(line => line.split('=')[0].trim())
              .filter(line => line && !line.startsWith('#'))
            );
          }
        } catch {}
        break;
    }
    
    return {
      internal: [...new Set(internal)].slice(0, 10),
      external: [...new Set(external)].slice(0, 20),
    };
  }
  
  private async detectConventions(projectPath: string): Promise<ProjectContext['conventions']> {
    const naming = 'mixed'; // Simplified detection
    let testing = false;
    let linting = false;
    
    // Check for testing
    try {
      await fs.access(path.join(projectPath, 'test'));
      testing = true;
    } catch {
      try {
        await fs.access(path.join(projectPath, 'tests'));
        testing = true;
      } catch {}
    }
    
    // Check for linting
    const lintFiles = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'pyproject.toml', 'setup.cfg'];
    for (const file of lintFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        linting = true;
        break;
      } catch {}
    }
    
    return { naming, testing, linting };
  }
  
  private async getAllFiles(projectPath: string, languages: string[]): Promise<string[]> {
    const allFiles: string[] = [];
    const extensions = languages.flatMap(lang => LANGUAGES[lang]?.extensions || []);
    
    if (extensions.length === 0) return allFiles;
    
    try {
      const files = await glob(`**/*{${extensions.join(',')}}`, {
        cwd: projectPath,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/target/**', '**/__pycache__/**'],
      });
      allFiles.push(...files);
    } catch {}
    
    return allFiles.slice(0, 100);
  }
  
  private async getConfigFiles(projectPath: string): Promise<string[]> {
    const configFiles: string[] = [];
    const patterns = [
      '*.config.*',
      '.*rc*',
      'Makefile',
      'Dockerfile*',
      'docker-compose*',
      '.env*',
      '*.toml',
      '*.yaml',
      '*.yml',
      '*.json',
    ];
    
    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { cwd: projectPath, nodir: true });
        configFiles.push(...files);
      } catch {}
    }
    
    return [...new Set(configFiles)].slice(0, 20);
  }
  
  private async getAllDirectories(projectPath: string): Promise<string[]> {
    const dirs: string[] = [];
    
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            !entry.name.startsWith('_') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist' &&
            entry.name !== 'build') {
          dirs.push(entry.name);
        }
      }
    } catch {}
    
    return dirs;
  }
  
  private async getFilesInDir(dirPath: string): Promise<string[]> {
    try {
      const files = await glob('**/*', {
        cwd: dirPath,
        nodir: true,
        ignore: ['*.spec.*', '*.test.*', '*_test.*', '__pycache__/**'],
      });
      return files;
    } catch {
      return [];
    }
  }
  
  private generateObjective(name: string, language: string, architecture?: ProjectContext['architecture']): string {
    const parts = [`Desenvolver e manter o projeto ${name}`];
    
    if (language !== 'unknown') {
      parts.push(`utilizando ${LANGUAGES[language]?.name || language}`);
    }
    
    if (architecture) {
      parts.push(`com arquitetura ${architecture.pattern}`);
    }
    
    return parts.join(' ') + '.';
  }
  
  private generateDescription(
    name: string, 
    language: string, 
    architecture: ProjectContext['architecture'] | undefined,
    moduleCount: number
  ): string {
    const parts = [`Projeto ${name}`];
    
    if (language !== 'unknown') {
      parts.push(`desenvolvido em ${LANGUAGES[language]?.name || language}`);
    }
    
    if (architecture) {
      parts.push(`seguindo ${architecture.pattern}`);
    }
    
    if (moduleCount > 0) {
      parts.push(`com ${moduleCount} módulo(s) organizado(s)`);
    }
    
    return parts.join(' ') + '.';
  }
  
  // Generate Markdown for the context file
  generateMarkdown(context: ProjectContext): string {
    const lines: string[] = [];
    
    // Frontmatter
    lines.push('---');
    lines.push(`name: ${context.name}`);
    lines.push(`objective: |`);
    lines.push(`  ${context.objective}`);
    lines.push(`primary_language: ${context.primaryLanguage}`);
    lines.push(`languages:`);
    context.languages.forEach(lang => {
      const langName = LANGUAGES[lang]?.name || lang;
      lines.push(`  - ${langName}`);
    });
    if (context.architecture) {
      lines.push(`architecture:`);
      lines.push(`  pattern: ${context.architecture.pattern}`);
      lines.push(`  confidence: ${context.architecture.confidence}`);
    }
    lines.push('---');
    lines.push('');
    
    // Description
    lines.push('# Visão Geral');
    lines.push('');
    lines.push(context.description);
    lines.push('');
    
    // Architecture
    if (context.architecture) {
      lines.push('## Arquitetura');
      lines.push('');
      lines.push(`**Padrão:** ${context.architecture.pattern}`);
      lines.push('');
      lines.push(`**Confiança:** ${context.architecture.confidence}`);
      lines.push('');
      lines.push(context.architecture.description);
      lines.push('');
    }
    
    // Structure
    lines.push('## Estrutura');
    lines.push('');
    
    if (context.structure.entryPoints.length > 0) {
      lines.push('### Pontos de Entrada');
      context.structure.entryPoints.forEach(ep => lines.push(`- \`${ep}\``));
      lines.push('');
    }
    
    if (context.structure.directories.length > 0) {
      lines.push('### Diretórios Principais');
      context.structure.directories.forEach(dir => lines.push(`- \`${dir}/\``));
      lines.push('');
    }
    
    // Modules
    if (context.modules.length > 0) {
      lines.push('## Módulos');
      lines.push('');
      
      context.modules.forEach(mod => {
        lines.push(`### ${mod.name}`);
        lines.push('');
        lines.push(`**Caminho:** \`${mod.path}\``);
        lines.push('');
        lines.push(`**Papel:** ${mod.role}`);
        lines.push('');
        lines.push(`**Arquivos:** ${mod.fileCount}`);
        lines.push('');
        if (mod.keyFiles.length > 0) {
          lines.push('**Arquivos-chave:**');
          mod.keyFiles.forEach(file => lines.push(`- \`${file}\``));
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      });
    }
    
    // Dependencies
    if (context.dependencies.external.length > 0) {
      lines.push('## Dependências');
      lines.push('');
      lines.push('### Externas Principais');
      context.dependencies.external.slice(0, 15).forEach(dep => lines.push(`- ${dep}`));
      lines.push('');
    }
    
    if (context.dependencies.internal.length > 0) {
      lines.push('### Internas');
      context.dependencies.internal.forEach(dep => lines.push(`- ${dep}`));
      lines.push('');
    }
    
    // Conventions
    lines.push('## Convenções');
    lines.push('');
    lines.push(`- **Nomenclatura:** ${context.conventions.naming}`);
    lines.push(`- **Testes:** ${context.conventions.testing ? 'Sim' : 'Não detectado'}`);
    lines.push(`- **Linting:** ${context.conventions.linting ? 'Sim' : 'Não detectado'}`);
    lines.push('');
    
    // Raw data summary
    lines.push('## Estatísticas');
    lines.push('');
    lines.push(`- **Total de arquivos:** ${context.rawData.allFiles.length}`);
    lines.push(`- **Arquivos de configuração:** ${context.rawData.configFiles.length}`);
    lines.push(`- **Módulos:** ${context.modules.length}`);
    lines.push('');
    
    return lines.join('\n');
  }
  
  // Generate agent instructions for deep analysis
  generateAgentInstructions(context: ProjectContext): string {
    return `Analise profundamente o projeto "${context.name}" localizado em ${context.structure.root}.

## Tarefas:

1. **Explore a estrutura completa**
   - Liste todos os diretórios principais
   - Identifique a organização de pastas
   - Encontre todos os arquivos de configuração

2. **Analise os módulos**
${context.modules.map(m => `   - **${m.name}** (${m.path}): ${m.role}`).join('\n')}

3. **Entenda as dependências**
   - Analise o arquivo de dependências principal
   - Identifique dependências críticas
   - Entenda o propósito de cada dependência principal

4. **Documente padrões de código**
   - Como são organizados os imports?
   - Quais convenções de nomenclatura são usadas?
   - Existe um estilo consistente de código?

5. **Identifique fluxos de dados**
   - Como os dados fluem entre camadas?
   - Onde estão as validações?
   - Como é feita a persistência?

6. **Encontre exemplos representativos**
   - Um controller/handler típico
   - Um serviço/caso de uso típico
   - Um modelo/entidade típica
   - Um teste típico (se existir)

## Formato do Relatório:

Gere um resumo estruturado em Markdown com:

### 1. Resumo Executivo
- Propósito do projeto (1 parágrafo)
- Arquitetura geral
- Complexidade estimada

### 2. Módulos Detalhados
Para cada módulo encontrado:
- Nome e propósito
- Responsabilidades específicas
- Interações com outros módulos
- Arquivos principais

### 3. Fluxos de Negócio
- Principais operações/casos de uso
- Como os dados entram e saem
- Pontos críticos de validação

### 4. Stack Completa
- Linguagens e frameworks
- Bancos de dados
- Ferramentas de build/deploy
- Bibliotecas significativas

### 5. Convenções e Padrões
- Estilo de código
- Estrutura de commits
- Organização de testes
- Documentação

### 6. Pontos de Atenção
- Débito técnico aparente
- Código duplicado
- Dependências desatualizadas
- Áreas complexas

Use as ferramentas disponíveis para explorar o código e gerar este relatório.`;
  }
}
