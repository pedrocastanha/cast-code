
import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export interface BridgeOptions {
  name: string;
  room: string;
  color: string;
  tool: string;
  reactive?: boolean;
}

interface BridgeRegistrationResponse {
  instanceId: string;
  token: string;
  roomId: string;
  name: string;
}

interface BridgeEvent {
  type: string;
  payload: {
    message?: string;
    toolName?: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class BridgeCommandsService {
  private readonly logger = new Logger(BridgeCommandsService.name);
  private readonly BRIDGE_PORT = 3336;
  private childProcess: ChildProcess | null = null;
  private instanceId: string | null = null;
  private token: string | null = null;
  private inboxEventSource: http.ClientRequest | null = null;
  private inboxPollInterval: NodeJS.Timeout | null = null;
  private lastMessageId: string | null = null;
  private isRunning = false;

    async startBridge(args: string[]): Promise<void> {
    if (this.isRunning) {
      console.log('\n⚠️  Bridge is already running\n');
      return;
    }

    const options = this.parseBridgeArgs(args);

    if (!options) {
      this.printUsage();
      return;
    }

    try {
      console.log(`\n🌉 Starting Room Bridge for ${options.name}...\n`);

      
      const registration = await this.registerAgent(options);

      if (!registration) {
        console.log('\n❌ Failed to register with Room Bridge Server\n');
        console.log('Make sure the Room Server is running: cast rooms --serve\n');
        return;
      }

      this.instanceId = registration.instanceId;
      this.token = registration.token;

      console.log(`   ${this.formatSuccess('✓')} Registered as "${options.name}"`);
      console.log(`   ${this.formatSuccess('✓')} Room: ${registration.roomId}`);
      console.log(`   ${this.formatSuccess('✓')} Instance ID: ${registration.instanceId}\n`);

      const useQwenWrapper = options.tool.toLowerCase() === 'qwen';

      await this.spawnTool(options, args);


      this.subscribeToInbox();

      // Only start inbox polling if NOT using qwen-wrapper (qwen-wrapper handles its own polling)
      if (!useQwenWrapper) {
        this.startInboxPolling(registration.roomId, options.name);
      }

      this.isRunning = true;

      console.log(`\n${this.formatInfo('ℹ')} View all agents at: http://localhost:5173/rooms\n`);
      console.log(`${this.formatInfo('ℹ')} Press Ctrl+C to disconnect\n`);
    } catch (error) {
      console.log(`\n❌ Bridge error: ${(error as Error).message}\n`);
      this.cleanup();
    }
  }

    async stopBridge(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log(`\n${this.formatInfo('ℹ')} Disconnecting bridge...\n`);

    await this.unregisterAgent();
    this.cleanup();

    console.log(`${this.formatSuccess('✓')} Bridge disconnected\n`);
  }

  private parseBridgeArgs(args: string[]): BridgeOptions | null {
    let name = 'External Agent';
    let room = 'bar';
    let color = '#a78bfa';
    let tool = '';
    let reactive = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--name' && args[i + 1]) {
        name = args[++i];
      } else if (arg === '--room' && args[i + 1]) {
        room = args[++i];
      } else if (arg === '--color' && args[i + 1]) {
        color = args[++i];
      } else if (arg === '--reactive') {
        reactive = true;
      } else if (arg === '--' && args[i + 1]) {
        // All args after -- are for the tool
        tool = args[i + 1];
        break;
      }
    }

    // Heuristic for tool if not provided after --
    if (!tool) {
      const toolKeywords = ['claude', 'codex', 'qwen', 'gemini', 'ollama'];
      for (const arg of args) {
        if (toolKeywords.includes(arg.toLowerCase())) {
          tool = arg;
          break;
        }
      }
    }

    if (!tool) {
      return null;
    }

    return { name, room, color, tool, reactive };
  }

    private async registerAgent(options: BridgeOptions): Promise<BridgeRegistrationResponse | null> {
    return new Promise((resolve) => {
      const data = {
        name: options.name,
        tool: options.tool,
        roomId: options.room,
        color: options.color,
        model: `${options.tool}-latest`,
        provider: this.inferProvider(options.tool),
      };

      console.log(`\n${this.formatInfo('ℹ')} Connecting to Room Bridge Server at localhost:${this.BRIDGE_PORT}...\n`);

      const req = http.request(
        {
          hostname: 'localhost',
          port: this.BRIDGE_PORT,
          path: '/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            console.log(`\n${this.formatInfo('ℹ')} Registration response status: ${res.statusCode}\n`);
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(body) as BridgeRegistrationResponse;
                resolve(parsed);
              } catch (err) {
                console.error(`\n${this.formatError('✗')} Failed to parse registration response: ${(err as Error).message}\n`);
                resolve(null);
              }
            } else {
              console.error(`\n${this.formatError('✗')} Registration failed with status ${res.statusCode}: ${body}\n`);
              resolve(null);
            }
          });
        },
      );

      req.on('error', (err) => {
        console.error(`\n${this.formatError('✗')} Registration request failed: ${err.message}\n`);
        console.error(`\n${this.formatError('✗')} Is the Room Bridge Server running on port ${this.BRIDGE_PORT}?\n`);
        resolve(null);
      });

      req.write(JSON.stringify(data));
      req.end();
    });
  }

    private async unregisterAgent(): Promise<void> {
    if (!this.instanceId || !this.token) {
      return;
    }

    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: this.BRIDGE_PORT,
          path: '/unregister',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            resolve();
          });
        },
      );

      req.on('error', () => {
        resolve();
      });

      req.write(JSON.stringify({ instanceId: this.instanceId!, token: this.token! }));
      req.end();
    });
  }

    private async spawnTool(options: BridgeOptions, args: string[]): Promise<void> {
    
    const toolIndex = args.indexOf('--');
    const toolArgs = toolIndex >= 0 ? args.slice(toolIndex + 1) : [options.tool];

    if (toolArgs.length === 0) {
      throw new Error('No tool command specified');
    }

    const command = toolArgs[0];
    const toolArguments = toolArgs.slice(1);

    const useQwenWrapper = command.toLowerCase() === 'qwen';

    const spawnCommand = useQwenWrapper 
      ? 'node'
      : command;
    
    const spawnArgs = useQwenWrapper
      ? [path.join(process.cwd(), 'scripts', 'qwen-wrapper.js'), options.room, options.name, ...toolArguments]
      : toolArguments;

    this.logger.log(`Spawning tool: ${spawnCommand} ${spawnArgs.join(' ')}${useQwenWrapper ? ' (using qwen-wrapper)' : ''}`);

    this.childProcess = spawn(spawnCommand, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    
    if (this.childProcess.stdout) {
      const rl = readline.createInterface({
        input: this.childProcess.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        
        process.stdout.write(`${line}\n`);

        
        const event = this.parseToolOutput(line, options.tool);
        if (event) {
          this.emitEvent(event);
        }
      });
    }

    
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    
    this.childProcess.on('exit', (code) => {
      this.logger.log(`Tool exited with code ${code}`);
      this.cleanup();
    });

    this.childProcess.on('error', (error) => {
      console.log(`\n${this.formatError('✗')} Tool error: ${error.message}\n`);
      this.cleanup();
    });
  }

    private subscribeToInbox(): void {
    if (!this.instanceId || !this.token) {
      return;
    }

    const req = http.get(
      {
        hostname: 'localhost',
        port: this.BRIDGE_PORT,
        path: `/${this.instanceId}/inbox`,
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      },
      (res) => {
        res.setEncoding('utf8');

        res.on('data', (data: string) => {
          
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                this.handleIncomingMessage(event, this.isRunning === true); // use options.reactive here if preferred
              } catch {
                
              }
            }
          }
        });

        res.on('error', () => {
          this.logger.debug('Inbox connection lost, reconnecting...');
          setTimeout(() => this.subscribeToInbox(), 3000);
        });
      },
    );

    req.on('error', (error) => {
      this.logger.debug(`Inbox error: ${error.message}`);
    });

    this.inboxEventSource = req;
  }

  private handleIncomingMessage(
    event: {
      type: string;
      data: {
        fromAgentId: string;
        fromAgentName: string;
        content: string;
        type: string;
      };
    },
    reactive: boolean = false
  ): void {
    if (event.type === 'room.message' && event.data) {
      const { fromAgentId, fromAgentName, content } = event.data;
      
      // Don't react to self
      if (fromAgentId.toLowerCase() === this.instanceId?.toLowerCase()) {
        return;
      }

      console.log(`\n${this.formatInfo('📨')} Message from ${fromAgentName}: ${content}\n`);

      if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
        if (reactive) {
          // Wrap in a system-like prompt hint
          const prompt = `[MESSAGE from ${fromAgentName}]: ${content}\n`;
          this.childProcess.stdin.write(prompt);
        } else {
          this.childProcess.stdin.write(`${content}\n`);
        }
      }
    }
  }

  private parseToolOutput(line: string, tool: string): BridgeEvent | null {
    const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '').trim();
    if (!cleanLine) return null;

    if (tool.toLowerCase().includes('claude')) {
      if (cleanLine.includes('"type":"content_block_start"') || cleanLine.includes('thinking...')) {
        return { type: 'agent.thinking', payload: {} };
      }
      if (cleanLine.includes('"type":"tool_use"') || cleanLine.includes('calling tool')) {
        const match = cleanLine.match(/"name":"([^"]+)"/) || cleanLine.match(/calling tool ([^ \.]+)/);
        return { type: 'agent.tool.called', payload: { toolName: match?.[1] ?? 'tool' } };
      }
    }

    // Thinking detection (broadened)
    if (/\[thinking\]|thinking\.\.\.|analyzing|searching|planning/i.test(cleanLine)) {
      return { type: 'agent.thinking', payload: {} };
    }

    // Tool use detection (broadened)
    if (/executing|running|calling|using tool|running tool/i.test(cleanLine)) {
      const toolMatch = cleanLine.match(/(?:tool|command|running) (?:[:"']*)([^\s"':]+)/i);
      return { type: 'agent.tool.called', payload: { toolName: toolMatch?.[1] ?? 'tool' } };
    }

    // Completion detection
    if (/completed|done|finished|successfully|ready\./i.test(cleanLine)) {
      return { type: 'agent.task.completed', payload: {} };
    }

    // Failure detection
    if (/error|failed|exception|rejected|abort/i.test(cleanLine)) {
      return { type: 'agent.task.failed', payload: { error: cleanLine.slice(0, 100) } };
    }

    // Message detection (heuristics)
    // - Long lines that are not logs
    // - Lines that look like conversational output
    if (cleanLine.length > 20 && 
        !cleanLine.startsWith('[') && 
        !cleanLine.startsWith('{') && 
        !cleanLine.startsWith('> ') &&
        !/^(\d{2}:\d{2}:\d{2}|DEBUG|INFO|WARN|ERROR)/.test(cleanLine)) {
      
      // Limit frequency of messages
      return { type: 'agent.message.sent', payload: { message: cleanLine.slice(0, 500) } };
    }

    return null;
  }

  /**
   * Emit event to Room Bridge Server
   */
  private emitEvent(event: BridgeEvent): void {
    if (!this.instanceId || !this.token) {
      return;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: this.BRIDGE_PORT,
        path: `/${this.instanceId}/event`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
      },
      (res) => {
        res.on('data', () => {});
      },
    );

    req.on('error', () => {
      // Silently ignore - events are best-effort
    });

    req.write(JSON.stringify(event));
    req.end();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isRunning = false;

    if (this.inboxPollInterval) {
      clearInterval(this.inboxPollInterval);
      this.inboxPollInterval = null;
    }

    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }

    if (this.inboxEventSource) {
      this.inboxEventSource.destroy();
      this.inboxEventSource = null;
    }

    this.instanceId = null;
    this.token = null;
  }

  /**
   * Infer provider from tool name
   */
  private inferProvider(tool: string): string {
    const toolLower = tool.toLowerCase();
    if (toolLower.includes('claude')) return 'anthropic';
    if (toolLower.includes('codex') || toolLower.includes('gpt') || toolLower.includes('openai')) return 'openai';
    if (toolLower.includes('gemini')) return 'google';
    if (toolLower.includes('ollama')) return 'ollama';
    if (toolLower.includes('qwen')) return 'dashscope';
    return 'unknown';
  }

  private startInboxPolling(roomId: string, agentName: string): void {
    const inboxPath = path.join(process.cwd(), '.cast', 'rooms', roomId.replace(/[^a-zA-Z0-9-_]/g, '_'), `${agentName.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`);

    this.inboxPollInterval = setInterval(() => {
      if (!this.isRunning || !this.childProcess || this.childProcess.stdin.destroyed) {
        return;
      }

      try {
        if (!fs.existsSync(inboxPath)) {
          return;
        }

        const content = fs.readFileSync(inboxPath, 'utf-8');
        const messages = JSON.parse(content);

        const unread = messages.filter((m: any) => !m.read && m.id !== this.lastMessageId);

        if (unread.length > 0) {
          const latestMessage = unread[unread.length - 1];

          console.log(`\n${this.formatInfo('📨')} Message from ${latestMessage.fromAgentName}: ${latestMessage.content}\n`);

          const prompt = `[MESSAGE from ${latestMessage.fromAgentName}]: ${latestMessage.content}\n`;

          if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
            this.childProcess.stdin.write(prompt);
          }

          this.lastMessageId = latestMessage.id;

          messages.forEach((m: any) => {
            if (m.id === latestMessage.id) {
              m.read = true;
            }
          });

          fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
        }
      } catch (error) {
        this.logger.debug(`Inbox polling error: ${(error as Error).message}`);
      }
    }, 2000);
  }

  /**
   * Print usage information
   */
  private printUsage(): void {
    console.log(`
${this.formatTitle('🌉 Room Bridge — Cross-Terminal Agent Communication')}

Usage:
  cast bridge -- <tool-command>
  cast bridge --name "Claude" --room bar -- claude
  cast bridge --name "Codex" --room office -- codex --approval-mode suggest

Options:
  --name <name>      Display name for the agent (default: "External Agent")
  --room <room>      Room to join: bar, office, gym, park, space (default: "bar")
  --color <color>    Visual color in hex format (default: "#a78bfa")
  -- <command>       The tool command to run (required)

Examples:
  cast bridge -- claude
  cast bridge --name "My Agent" --room bar -- npx @anthropic-ai/claude-code
  cast bridge --name "Codex" --room office -- codex

View all agents:
  Open http:

`);
  }

  /**
   * Format helpers for console output
   */
  private formatTitle(text: string): string {
    return `\x1b[1m\x1b[36m${text}\x1b[0m`;
  }

  private formatSuccess(text: string): string {
    return `\x1b[32m${text}\x1b[0m`;
  }

  private formatError(text: string): string {
    return `\x1b[31m${text}\x1b[0m`;
  }

  private formatInfo(text: string): string {
    return `\x1b[33m${text}\x1b[0m`;
  }
}
