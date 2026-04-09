import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Colors, colorize, Box, Icons } from '../../utils/theme';

const execAsync = promisify(exec);

interface ProjectType {
  language: 'typescript' | 'python' | 'unknown';
  framework?: string;
  hasLangChain?: boolean;
  hasLangGraph?: boolean;
  hasCrewAI?: boolean;
  hasLlamaIndex?: boolean;
  hasOpenAI?: boolean;
  hasAnthropic?: boolean;
  rootPath: string;
  packageJsonPath?: string;
  requirementsTxtPath?: string;
  mainFile?: string;
}

@Injectable()
export class TracecastCommandsService {
  async cmdTracecast(args: string[]): Promise<void> {
    const sub = args[0] || 'setup';

    switch (sub) {
      case 'setup':
      case 'init':
        await this.setupTracecast();
        break;

      case 'status':
        await this.checkStatus();
        break;

      case 'help':
      default:
        this.printHelp();
        break;
    }
  }

  private async detectProject(): Promise<ProjectType> {
    const project: ProjectType = {
      language: 'unknown',
      rootPath: process.cwd(),
    };

    // Check for TypeScript/Node.js project
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    try {
      await fs.access(packageJsonPath);
      project.language = 'typescript';
      project.packageJsonPath = packageJsonPath;

      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      project.hasLangChain = !!(deps['langchain'] || deps['@langchain/core'] || deps['@langchain/openai']);
      project.hasLangGraph = !!deps['langgraph'];
      project.hasCrewAI = false; // CrewAI is Python-only
      project.hasLlamaIndex = !!deps['llamaindex'];
      project.hasOpenAI = !!deps['openai'];
      project.hasAnthropic = !!deps['@anthropic-ai/sdk'];

      // Detect framework
      if (deps['next']) project.framework = 'Next.js';
      else if (deps['express']) project.framework = 'Express';
      else if (deps['fastify']) project.framework = 'Fastify';
      else if (deps['@nestjs/core']) project.framework = 'NestJS';
      else if (deps['react'] && deps['vite']) project.framework = 'React+Vite';
      else if (deps['react']) project.framework = 'React';

      // Try to find main file
      if (packageJson.main) {
        project.mainFile = path.join(process.cwd(), packageJson.main);
      }
    } catch {
      // No package.json
    }

    // Check for Python project
    const requirementsPath = path.join(process.cwd(), 'requirements.txt');
    const pyprojectPath = path.join(process.cwd(), 'pyproject.toml');

    try {
      await fs.access(requirementsPath);
      project.language = project.language === 'typescript' ? 'typescript' : 'python';
      project.requirementsTxtPath = requirementsPath;

      const requirements = await fs.readFile(requirementsPath, 'utf-8');
      project.hasLangChain = requirements.includes('langchain') || requirements.includes('langchain-openai') || requirements.includes('langchain-anthropic');
      project.hasLangGraph = requirements.includes('langgraph');
      project.hasCrewAI = requirements.includes('crewai');
      project.hasLlamaIndex = requirements.includes('llama-index');
      project.hasOpenAI = requirements.includes('openai');
      project.hasAnthropic = requirements.includes('anthropic');

      if (project.language === 'unknown') {
        project.language = 'python';
      }
    } catch {
      // No requirements.txt
    }

    try {
      await fs.access(pyprojectPath);
      if (project.language === 'unknown') {
        project.language = 'python';
      }

      const pyproject = await fs.readFile(pyprojectPath, 'utf-8');
      project.hasLangChain = pyproject.includes('langchain') || pyproject.includes('langchain-openai') || pyproject.includes('langchain-anthropic');
      project.hasLangGraph = pyproject.includes('langgraph');
      project.hasCrewAI = pyproject.includes('crewai');
      project.hasLlamaIndex = pyproject.includes('llama-index');
    } catch {
      // No pyproject.toml
    }

    return project;
  }

  private async setupTracecast(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.wrench + ' ', 'accent') + colorize('Tracecast Setup', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    try {
      w(colorize('  🔍 Detecting project type...\r\n', 'info'));
      const project = await this.detectProject();

      if (project.language === 'unknown') {
        w(colorize('  ✗ Could not detect a supported project\r\n', 'error'));
        w(colorize('  Supported: TypeScript (npm) or Python (pip/poetry)\r\n\r\n', 'muted'));
        return;
      }

      w(colorize(`  ✓ Detected: ${project.language}` , 'success'));
      if (project.framework) {
        w(colorize(` (${project.framework})`, 'accent'));
      }
      w('\r\n');

      // Check if already installed
      const alreadyInstalled = await this.checkIfInstalled(project);
      if (alreadyInstalled) {
        w(colorize('  ✓ Tracecast is already installed\r\n', 'success'));
      } else {
        w(colorize('  📦 Installing tracecast...\r\n', 'info'));
        await this.installTracecast(project);
        w(colorize('  ✓ Tracecast installed\r\n', 'success'));
      }

      // Check for existing configuration
      const hasConfig = await this.checkExistingConfig(project);
      if (hasConfig) {
        w(colorize('  ⚠️  Existing tracecast configuration found\r\n', 'warning'));
        const shouldOverwrite = await this.askOverwrite();
        if (!shouldOverwrite) {
          w(colorize('  Setup cancelled.\r\n\r\n', 'muted'));
          return;
        }
      }

      w(colorize('  ⚙️  Configuring tracecast...\r\n', 'info'));
      await this.configureTracecast(project);

      // Scan and wrap LLM calls
      w(colorize('  🔎 Scanning for LLM/API calls...\r\n', 'info'));
      const wrappedFiles = await this.scanAndWrapLLMCalls(project);
      if (wrappedFiles.length > 0) {
        w(colorize(`  ✓ Wrapped ${wrappedFiles.length} file(s):\r\n`, 'success'));
        wrappedFiles.forEach(file => {
          w(colorize(`    • ${file}\r\n`, 'muted'));
        });
      } else {
        w(colorize('  ℹ No LLM calls detected - manual wrapping may be needed\r\n', 'info'));
      }

      w('\r\n');
      w(colorize('✅', 'success') + ' ' + colorize('Tracecast configured successfully!', 'bold') + '\r\n\r\n');
      w(colorize('  Next steps:\r\n', 'bold'));
      w(colorize('  1. Review the wrapped files to ensure correctness\r\n', 'muted'));
      w(colorize('  2. Update exporter credentials if needed\r\n', 'muted'));
      w(colorize('  3. Run your application to verify tracing works\r\n', 'muted'));
      w('\r\n');

      // Validate server startup
      w(colorize('  🚀 Validating server startup...\r\n', 'info'));
      const validationResult = await this.validateServerStartup(project);
      if (validationResult.success) {
        w(colorize('  ✓ Server started successfully with tracecast\r\n', 'success'));
        if (validationResult.output) {
          w(colorize(`  ${validationResult.output}\r\n`, 'muted'));
        }
      } else {
        w(colorize(`  ⚠️  Server validation issue: ${validationResult.error}\r\n`, 'warning'));
        w(colorize('  This might be normal if your server requires additional setup\r\n', 'muted'));
        w(colorize('  Check the wrapped files and configuration\r\n\r\n', 'muted'));
      }

      w(colorize('  📖 Docs: https://www.npmjs.com/package/tracecast\r\n', 'info'));
      w(colorize('  📖 Docs: https://pypi.org/project/tracecast/\r\n\r\n', 'info'));

    } catch (error: any) {
      w(colorize(`\r\n  ✗ Error setting up tracecast: ${error.message}\r\n\r\n`, 'error'));
    }
  }

  private async checkIfInstalled(project: ProjectType): Promise<boolean> {
    try {
      if (project.language === 'typescript') {
        const packageJson = JSON.parse(await fs.readFile(project.packageJsonPath!, 'utf-8'));
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        return !!deps['tracecast'];
      } else if (project.language === 'python') {
        if (project.requirementsTxtPath) {
          const requirements = await fs.readFile(project.requirementsTxtPath, 'utf-8');
          return requirements.includes('tracecast');
        }
        if (await this.fileExists(path.join(project.rootPath, 'pyproject.toml'))) {
          const pyproject = await fs.readFile(path.join(project.rootPath, 'pyproject.toml'), 'utf-8');
          return pyproject.includes('tracecast');
        }
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  private async installTracecast(project: ProjectType): Promise<void> {
    try {
      if (project.language === 'typescript') {
        await execAsync('npm install tracecast', { cwd: project.rootPath });
      } else if (project.language === 'python') {
        // Add to requirements.txt first
        if (project.requirementsTxtPath) {
          const requirements = await fs.readFile(project.requirementsTxtPath, 'utf-8');
          if (!requirements.includes('tracecast')) {
            const updated = requirements + '\ntracecast>=0.1.0\n';
            await fs.writeFile(project.requirementsTxtPath, updated, 'utf-8');
          }
        }

        // Try pip with --break-system-packages flag if needed
        if (await this.fileExists(path.join(project.rootPath, 'pyproject.toml'))) {
          await execAsync('poetry add tracecast', { cwd: project.rootPath });
        } else {
          // Try with --break-system-packages for modern Python environments
          try {
            await execAsync('pip install tracecast --break-system-packages', { cwd: project.rootPath });
          } catch {
            // Fallback to regular pip
            await execAsync('pip install tracecast', { cwd: project.rootPath });
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to install tracecast: ${error.message}`);
    }
  }

  private async checkExistingConfig(project: ProjectType): Promise<boolean> {
    // Check for tracecast configuration files
    const configPaths = [
      path.join(project.rootPath, 'tracecast.config.ts'),
      path.join(project.rootPath, 'tracecast.config.js'),
      path.join(project.rootPath, 'tracecast.config.py'),
      path.join(project.rootPath, '.tracecast'),
    ];

    for (const configPath of configPaths) {
      if (await this.fileExists(configPath)) {
        return true;
      }
    }

    // Check if already imported in main files
    if (project.language === 'typescript') {
      // Check source files, not dist
      const srcIndex = path.join(project.rootPath, 'src', 'index.ts');
      if (await this.fileExists(srcIndex)) {
        const content = await fs.readFile(srcIndex, 'utf-8');
        if (content.includes('tracecast')) {
          return true;
        }
      }

      // Also check mainFile if it exists and is in src/
      if (project.mainFile && project.mainFile.includes('/src/')) {
        const mainContent = await fs.readFile(project.mainFile, 'utf-8');
        if (mainContent.includes('tracecast')) {
          return true;
        }
      }
    }

    return false;
  }

  private async askOverwrite(): Promise<boolean> {
    const { createInterface } = require('readline');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(
        colorize('  Overwrite existing configuration? (y/N): ', 'warning'),
        (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        }
      );
    });
  }

  private async configureTracecast(project: ProjectType): Promise<void> {
    if (project.language === 'typescript') {
      await this.configureTypeScript(project);
    } else if (project.language === 'python') {
      await this.configurePython(project);
    }
  }

  private async configureTypeScript(project: ProjectType): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    // Create tracecast configuration file
    const configContent = `import { Tracer, JsonFileExporter } from 'tracecast';

// Initialize TraceCast
export const tracer = new Tracer({
  exporters: [
    new JsonFileExporter({
      outputPath: './traces',
      fileName: 'trace-{timestamp}.json',
    }),
  ],
  logging: true,
  logPrefix: '[TraceCast]',
});

// Helper function to trace LLM calls
export async function traceLLMCall(
  name: string,
  fn: () => Promise<any>,
  options?: {
    userId?: string;
    metadata?: Record<string, any>;
  }
) {
  return await tracer.trace(name, async (trace) => {
    try {
      const result = await fn();
      
      // Extract usage from result (OpenAI format)
      if (result.usage) {
        trace.appendSpan({
          span_id: \`span-\${Date.now()}\`,
          type: 'LLM',
          tokens_in: result.usage.prompt_tokens || 0,
          tokens_out: result.usage.completion_tokens || 0,
          model: result.model,
        });
      }
      
      return result;
    } catch (error) {
      trace.appendSpan({
        span_id: \`span-\${Date.now()}\`,
        type: 'LLM',
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }, options);
}
`;

    const configPath = path.join(project.rootPath, 'src', 'tracecast.config.ts');
    
    // Try to put it in src/, fallback to root
    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
    } catch {
      // If src/ doesn't exist, use root
    }

    const finalConfigPath = await this.fileExists(path.dirname(configPath))
      ? configPath
      : path.join(project.rootPath, 'tracecast.config.ts');

    await fs.writeFile(finalConfigPath, configContent, 'utf-8');
    w(colorize(`  ✓ Created configuration: ${finalConfigPath}\r\n`, 'success'));

    // If project uses LangChain, create integration example
    if (project.hasLangChain || project.hasLangGraph) {
      const langchainExample = `import { TraceCastCallback } from 'tracecast';
import { ChatOpenAI } from '@langchain/openai';

// Create TraceCast callback
const tracecastCallback = new TraceCastCallback({
  tracer: tracer,
});

// Use with LangChain
const model = new ChatOpenAI({
  model: 'gpt-4',
  callbacks: [tracecastCallback],
});

// All LLM calls will now be traced automatically
const response = await model.invoke('Hello!');
`;

      const examplePath = path.join(project.rootPath, 'tracecast-langchain.example.ts');
      await fs.writeFile(examplePath, langchainExample, 'utf-8');
      w(colorize(`  ✓ Created LangChain integration example: ${examplePath}\r\n`, 'success'));
    }

    // Add to package.json scripts if not exists
    if (project.packageJsonPath) {
      const packageJson = JSON.parse(await fs.readFile(project.packageJsonPath, 'utf-8'));
      if (!packageJson.scripts?.traces) {
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts.traces = 'mkdir -p traces && echo "Traces will be saved to ./traces/"';
        await fs.writeFile(project.packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        w(colorize('  ✓ Added "traces" script to package.json\r\n', 'success'));
      }
    }
  }

  private async configurePython(project: ProjectType): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    // Create tracecast configuration file
    const configContent = `from tracecast import Tracer, JsonFileExporter

# Initialize TraceCast
tracer = Tracer(
    exporters=[
        JsonFileExporter(
            output_path="./traces",
            file_name="trace-{timestamp}.json"
        )
    ],
    logging=True,
    log_prefix="[TraceCast]"
)

# Helper function to trace LLM calls
def trace_llm_call(name: str, fn, user_id: str = None, metadata: dict = None):
    """Context manager for tracing LLM calls"""
    with tracer.trace(name, user_id=user_id) as trace:
        try:
            result = fn()
            
            # Extract usage from result (OpenAI format)
            if hasattr(result, 'usage'):
                trace.spans.append({
                    'span_id': f'span-{int(time.time() * 1000)}',
                    'type': 'LLM',
                    'tokens_in': result.usage.prompt_tokens or 0,
                    'tokens_out': result.usage.completion_tokens or 0,
                    'model': result.model
                })
            
            return result
        except Exception as e:
            trace.spans.append({
                'span_id': f'span-{int(time.time() * 1000)}',
                'type': 'LLM',
                'status': 'error',
                'error': str(e)
            })
            raise
`;

    const configPath = path.join(project.rootPath, 'tracecast_config.py');
    await fs.writeFile(configPath, configContent, 'utf-8');
    w(colorize(`  ✓ Created configuration: ${configPath}\r\n`, 'success'));

    // If project uses LangChain, create integration example
    if (project.hasLangChain || project.hasLangGraph) {
      const langchainExample = `from tracecast import TraceCastCallback
from langchain_openai import ChatOpenAI

# Create TraceCast callback
tracecast_callback = TraceCastCallback(tracer=tracer)

# Use with LangChain - zero configuration!
llm = ChatOpenAI(model='gpt-4')
response = llm.invoke('Hello!', config={'callbacks': [tracecast_callback]})

# All LLM calls will now be traced automatically
`;

      const examplePath = path.join(project.rootPath, 'tracecast_langchain_example.py');
      await fs.writeFile(examplePath, langchainExample, 'utf-8');
      w(colorize(`  ✓ Created LangChain integration example: ${examplePath}\r\n`, 'success'));
    }

    // If project uses CrewAI, create integration example
    if (project.hasCrewAI) {
      const crewaiExample = `from tracecast import Tracer, Span
from crewai import Crew, Agent, Task

# After crew.kickoff(), manually create spans
with tracer.trace('crew_execution') as trace:
    result = crew.kickoff()
    
    # Extract token usage if available
    if hasattr(result, 'token_usage'):
        trace.spans.append(Span(
            span_id=f'span-{int(time.time() * 1000)}',
            type='AGENT',
            tokens_in=result.token_usage.prompt_tokens,
            tokens_out=result.token_usage.completion_tokens
        ))
`;

      const examplePath = path.join(project.rootPath, 'tracecast_crewai_example.py');
      await fs.writeFile(examplePath, crewaiExample, 'utf-8');
      w(colorize(`  ✓ Created CrewAI integration example: ${examplePath}\r\n`, 'success'));
    }

    // Create traces directory
    const tracesDir = path.join(project.rootPath, 'traces');
    try {
      await fs.mkdir(tracesDir, { recursive: true });
      w(colorize('  ✓ Created traces/ directory\r\n', 'success'));
    } catch {
      // Already exists
    }
  }

  private async checkStatus(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.info + ' ', 'accent') + colorize('Tracecast Status', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    try {
      const project = await this.detectProject();

      if (project.language === 'unknown') {
        w(colorize('  ⚠️  No supported project detected\r\n', 'warning'));
        w(colorize('  Supported: TypeScript (npm) or Python (pip/poetry)\r\n\r\n', 'muted'));
        return;
      }

      w(colorize(`  Project: ${project.language}`, 'success'));
      if (project.framework) {
        w(colorize(` (${project.framework})`, 'accent'));
      }
      w('\r\n\r\n');

      const installed = await this.checkIfInstalled(project);
      w(colorize(`  Installed: ${installed ? 'Yes ✓' : 'No ✗'}\r\n`, installed ? 'success' : 'warning'));

      const hasConfig = await this.checkExistingConfig(project);
      w(colorize(`  Configured: ${hasConfig ? 'Yes ✓' : 'No ✗'}\r\n\r\n`, hasConfig ? 'success' : 'warning'));

      if (!installed || !hasConfig) {
        w(colorize('  Run /tracecast to set up\r\n\r\n', 'info'));
      }

    } catch (error: any) {
      w(colorize(`  ✗ Error checking status: ${error.message}\r\n\r\n`, 'error'));
    }
  }

  private printHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.info + ' ', 'accent') + colorize('Tracecast Commands', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n\r\n');

    w(colorize('Commands:', 'bold') + '\r\n');
    w(`  ${colorize('/tracecast', 'cyan')}           → Setup tracecast in your project\r\n`);
    w(`  ${colorize('/tracecast setup', 'cyan')}     → Same as /tracecast\r\n`);
    w(`  ${colorize('/tracecast status', 'cyan')}     → Check tracecast installation status\r\n`);
    w(`  ${colorize('/tracecast help', 'cyan')}       → Show this help\r\n\r\n`);

    w(colorize('What is Tracecast?', 'bold') + '\r\n\r\n');
    w(colorize('  TraceCast is a lightweight LLM observability SDK\r\n', 'muted'));
    w(colorize('  for tracking tokens, costs, latency, and tool calls.\r\n\r\n', 'muted'));

    w(colorize('Features:', 'bold') + '\r\n');
    w(`  • Automatic token counting and cost calculation\r\n`);
    w(`  • Support for OpenAI, Anthropic, LangChain, LangGraph, CrewAI\r\n`);
    w(`  • Export traces to JSON files, MongoDB, or PostgreSQL\r\n`);
    w(`  • Framework-agnostic (TypeScript & Python)\r\n\r\n`);

    w(colorize('Documentation:', 'bold') + '\r\n');
    w(`  npm: https://www.npmjs.com/package/tracecast\r\n`);
    w(`  PyPI: https://pypi.org/project/tracecast/\r\n\r\n`);
  }

  private async validateServerStartup(project: ProjectType): Promise<{ success: boolean; error?: string; output?: string }> {
    try {
      // Try to detect start script
      if (project.language === 'typescript' && project.packageJsonPath) {
        const packageJson = JSON.parse(await fs.readFile(project.packageJsonPath, 'utf-8'));
        const startScript = packageJson.scripts?.start || packageJson.scripts?.dev;

        if (startScript) {
          // Try a dry-run: attempt to import the main file to check for syntax errors
          const mainFile = project.mainFile || path.join(project.rootPath, packageJson.main || 'index.js');
          const importCheck = await this.checkTypeScriptImports(project.rootPath, mainFile);
          
          if (!importCheck.success) {
            return { success: false, error: importCheck.error };
          }

          return { 
            success: true, 
            output: `Start script found: "${startScript}"` 
          };
        }
      } else if (project.language === 'python') {
        // Check for common Python entry points
        const possibleEntries = [
          'main.py',
          'app.py',
          'server.py',
          'manage.py',
          'wsgi.py',
          'asgi.py',
        ];

        for (const entry of possibleEntries) {
          const entryPath = path.join(project.rootPath, entry);
          if (await this.fileExists(entryPath)) {
            // Try Python syntax check
            const syntaxCheck = await this.checkPythonSyntax(entryPath);
            
            if (!syntaxCheck.success) {
              return { success: false, error: syntaxCheck.error };
            }

            return { 
              success: true, 
              output: `Entry point found: ${entry}` 
            };
          }
        }

        // Check for Makefile or docker-compose
        if (await this.fileExists(path.join(project.rootPath, 'Makefile'))) {
          return { success: true, output: 'Makefile found' };
        }
        if (await this.fileExists(path.join(project.rootPath, 'docker-compose.yml'))) {
          return { success: true, output: 'docker-compose.yml found' };
        }
      }

      return { success: false, error: 'No start script or entry point found' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async checkTypeScriptImports(rootPath: string, mainFile: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if tsconfig exists
      const tsconfigPath = path.join(rootPath, 'tsconfig.json');
      if (await this.fileExists(tsconfigPath)) {
        try {
          await execAsync('npx tsc --noEmit', { cwd: rootPath, timeout: 30000 });
          return { success: true };
        } catch (error: any) {
          // Return warning, not error - user might need to install deps
          return { success: true, error: 'TypeScript compilation has issues (might need npm install)' };
        }
      }

      // Just check if the file can be parsed
      await fs.readFile(mainFile, 'utf-8');
      return { success: true };
    } catch {
      return { success: true }; // Don't fail on validation issues
    }
  }

  private async checkPythonSyntax(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Try python3 first, fall back to python
      try {
        await execAsync(`python3 -m py_compile "${filePath}"`, { timeout: 10000 });
        return { success: true };
      } catch {
        await execAsync(`python -m py_compile "${filePath}"`, { timeout: 10000 });
        return { success: true };
      }
    } catch (error: any) {
      return { success: false, error: `Python syntax error: ${error.message}` };
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async scanAndWrapLLMCalls(project: ProjectType): Promise<string[]> {
    const wrappedFiles: string[] = [];

    try {
      if (project.language === 'typescript') {
        const tsFiles = await this.findFiles(project.rootPath, ['.ts', '.tsx'], ['node_modules', 'dist', '.next', 'build']);
        for (const file of tsFiles) {
          // Skip tracecast config and example files
          const basename = path.basename(file);
          if (basename.includes('tracecast')) continue;

          const wrapped = await this.wrapTypeScriptFile(file, project);
          if (wrapped) {
            wrappedFiles.push(file);
          }
        }
      } else if (project.language === 'python') {
        const pyFiles = await this.findFiles(project.rootPath, ['.py'], ['venv', '.venv', '__pycache__', '.git', 'site-packages']);
        for (const file of pyFiles) {
          // Skip tracecast config and example files
          const basename = path.basename(file);
          if (basename.includes('tracecast')) continue;

          const wrapped = await this.wrapPythonFile(file, project);
          if (wrapped) {
            wrappedFiles.push(file);
          }
        }
      }
    } catch (error: any) {
      // Log error but don't fail the setup
      const w = (s: string) => process.stdout.write(s);
      w(colorize(`  ⚠️  Warning: Error scanning files: ${error.message}\r\n`, 'warning'));
    }

    return wrappedFiles;
  }

  private async findFiles(dir: string, extensions: string[], excludeDirs: string[]): Promise<string[]> {
    const results: string[] = [];

    const walk = async (currentDir: string) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            if (extensions.some(ext => entry.name.endsWith(ext))) {
              results.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await walk(dir);
    return results;
  }

  private async wrapTypeScriptFile(filePath: string, project: ProjectType): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let modified = false;
      let newContent = content;

      // Detect OpenAI SDK usage
      if (content.includes('new OpenAI(') || content.includes('openai.chat.completions.create')) {
        if (!newContent.includes("from 'tracecast'") && !newContent.includes('from "tracecast"')) {
          newContent = `import { tracer } from './tracecast.config';\n` + newContent;
          modified = true;
        }

        // Wrap chat.completions.create calls
        if (content.includes('openai.chat.completions.create')) {
          newContent = this.wrapOpenAICall(newContent);
          modified = true;
        }
      }

      // Detect Anthropic usage
      if (content.includes('new Anthropic(') || content.includes('anthropic.messages.create')) {
        if (!newContent.includes("from 'tracecast'") && !newContent.includes('from "tracecast"')) {
          newContent = `import { tracer } from './tracecast.config';\n` + newContent;
          modified = true;
        }

        if (content.includes('anthropic.messages.create')) {
          newContent = this.wrapAnthropicCall(newContent);
          modified = true;
        }
      }

      // Detect LangChain usage
      if (content.includes('ChatOpenAI') || content.includes('ChatAnthropic') || content.includes('@langchain') || content.includes('langchain_')) {
        if (!newContent.includes("from 'tracecast'") && !newContent.includes('from "tracecast"') && !newContent.includes('from tracecast')) {
          const langImport = project.language === 'typescript'
            ? `import { tracer } from './tracecast.config';\n`
            : `from tracecast import tracer\n`;
          newContent = langImport + newContent;
          modified = true;
        }

        // For LangChain, add TraceCastCallback to invoke calls
        if (project.language === 'typescript' && content.includes('.invoke(')) {
          newContent = this.wrapLangChainInvoke(newContent);
          modified = true;
        } else if (project.language === 'python' && content.includes('.invoke(')) {
          newContent = this.wrapPythonLangChainInvoke(newContent);
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      return modified;
    } catch {
      return false;
    }
  }

  private wrapOpenAICall(content: string): string {
    // Simple wrapping strategy: wrap openai.chat.completions.create calls
    const openaiPattern = /(const|let|var)\s+(\w+)\s*=\s*await\s+openai\.chat\.completions\.create\(([\s\S]*?)\);/g;

    if (openaiPattern.test(content)) {
      content = content.replace(
        openaiPattern,
        `const $2 = await tracer.trace('openai_chat_completion', async (trace) => {
  const result = await openai.chat.completions.create($3);
  
  trace.appendSpan({
    span_id: \`span-\${Date.now()}\`,
    type: 'LLM',
    model: result.model,
    tokens_in: result.usage?.prompt_tokens || 0,
    tokens_out: result.usage?.completion_tokens || 0,
  });
  
  return result;
});`
      );
    }

    return content;
  }

  private wrapAnthropicCall(content: string): string {
    const anthropicPattern = /(const|let|var)\s+(\w+)\s*=\s*await\s+anthropic\.messages\.create\(([\s\S]*?)\);/g;

    if (anthropicPattern.test(content)) {
      content = content.replace(
        anthropicPattern,
        `const $2 = await tracer.trace('anthropic_message', async (trace) => {
  const result = await anthropic.messages.create($3);
  
  trace.appendSpan({
    span_id: \`span-\${Date.now()}\`,
    type: 'LLM',
    model: result.model,
    tokens_in: result.usage?.input_tokens || 0,
    tokens_out: result.usage?.output_tokens || 0,
  });
  
  return result;
});`
      );
    }

    return content;
  }

  private wrapLangChainInvoke(content: string): string {
    // Wrap .invoke() calls for LangChain with tracer.trace
    const invokePattern = /(const|let|var)\s+(\w+)\s*=\s*await\s+(\w+)\.invoke\(([\s\S]*?)\);/g;

    if (invokePattern.test(content)) {
      content = content.replace(
        invokePattern,
        `const $2 = await tracer.trace('langchain_invoke', async (trace) => {
  const result = await $3.invoke($4);
  
  trace.appendSpan({
    span_id: \`span-\${Date.now()}\`,
    type: 'LLM',
    model: $3.modelName || $3.model || 'unknown',
  });
  
  return result;
});`
      );
    }

    return content;
  }

  private wrapPythonLangChainInvoke(content: string): string {
    // Wrap .invoke() calls for Python LangChain
    const invokePattern = /^(\s*)(\w+)\s*=\s*(\w+)\.invoke\((.*)$/gm;

    if (invokePattern.test(content)) {
      content = content.replace(
        invokePattern,
        `$1with tracer.trace('langchain_invoke') as trace:
$1    $2 = $3.invoke($4
$1    
$1    trace.spans.append({
$1        'span_id': f'span-{int(__import__("time").time() * 1000)}',
$1        'type': 'LLM',
$1        'model': getattr($3, 'model_name', getattr($3, 'model', 'unknown'))
$1    })
`
      );
    }

    return content;
  }

  private async wrapPythonFile(filePath: string, project: ProjectType): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let modified = false;
      let newContent = content;

      // Detect OpenAI SDK usage
      if (content.includes('OpenAI(') || content.includes('openai.chat.completions.create') || content.includes('openai.ChatCompletion')) {
        if (!newContent.includes('from tracecast')) {
          newContent = `from tracecast import tracer\n` + newContent;
          modified = true;
        }

        if (content.includes('openai.chat.completions.create') || content.includes('openai.ChatCompletion.create')) {
          newContent = this.wrapPythonOpenAICall(newContent);
          modified = true;
        }
      }

      // Detect Anthropic usage
      if (content.includes('Anthropic(') || content.includes('anthropic.messages.create')) {
        if (!newContent.includes('from tracecast')) {
          newContent = `from tracecast import tracer\n` + newContent;
          modified = true;
        }
      }

      // Detect LangChain usage
      if (content.includes('ChatOpenAI') || content.includes('ChatAnthropic') || content.includes('langchain_openai') || content.includes('langchain_anthropic') || content.includes('langchain_core')) {
        if (!newContent.includes('from tracecast')) {
          newContent = `from tracecast import tracer\n` + newContent;
          modified = true;
        }

        if (content.includes('.invoke(')) {
          newContent = this.wrapPythonLangChainInvoke(newContent);
          modified = true;
        }
      }

      // Detect CrewAI usage
      if (content.includes('Crew(') || content.includes('crew.kickoff()')) {
        if (!newContent.includes('from tracecast')) {
          newContent = `from tracecast import tracer, Span\n` + newContent;
          modified = true;
        }

        // Wrap crew.kickoff()
        if (content.includes('crew.kickoff()')) {
          newContent = newContent.replace(
            /(\s*)(\w+)\s*=\s*crew\.kickoff\(\)/g,
            `$1with tracer.trace('crew_execution') as trace:\n$1    $2 = crew.kickoff()`
          );
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      return modified;
    } catch {
      return false;
    }
  }

  private wrapPythonOpenAICall(content: string): string {
    // Wrap openai.ChatCompletion.create calls
    const pattern = /(\w+)\s*=\s*openai\.ChatCompletion\.create\(([\s\S]*?)\)/g;

    if (pattern.test(content)) {
      content = content.replace(
        pattern,
        `with tracer.trace('openai_chat_completion') as trace:
    $1 = openai.ChatCompletion.create($2)
    
    if hasattr($1, 'usage'):
        trace.spans.append({
            'span_id': f'span-{int(__import__("time").time() * 1000)}',
            'type': 'LLM',
            'tokens_in': $1.usage.prompt_tokens,
            'tokens_out': $1.usage.completion_tokens,
            'model': $1.model
        })`
      );
    }

    return content;
  }
}
