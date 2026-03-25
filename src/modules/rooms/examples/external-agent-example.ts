/**
 * External Agent SDK Example
 * 
 * This example demonstrates how external AI agents (Claude Code, Codex, etc.)
 * can register with the Room Bridge and communicate with other agents.
 * 
 * Usage:
 *   npx ts-node src/modules/rooms/examples/external-agent-example.ts
 * 
 * Or integrate this pattern into your own agent implementation.
 */

import * as http from 'http';

const BRIDGE_PORT = 3336;

/**
 * ExternalAgentClient - SDK for connecting external agents to the Room Bridge
 */
class ExternalAgentClient {
  private instanceId: string | null = null;
  private token: string | null = null;
  private name: string;
  private tool: string;
  private roomId: string;
  private color: string;
  private model: string;
  private provider: string;
  private inboxPollInterval: NodeJS.Timeout | null = null;
  private lastMessageId: string | null = null;

  constructor(options: {
    name: string;
    tool: string;
    roomId?: string;
    color?: string;
    model?: string;
    provider?: string;
  }) {
    this.name = options.name;
    this.tool = options.tool;
    this.roomId = options.roomId ?? 'bar';
    this.color = options.color ?? '#a78bfa';
    this.model = options.model ?? `${options.tool}-latest`;
    this.provider = options.provider ?? this.inferProvider(options.tool);
  }

  /**
   * Register this agent with the Room Bridge Server
   */
  async register(): Promise<{ instanceId: string; token: string }> {
    const response = await this.httpPost('/register', {
      name: this.name,
      tool: this.tool,
      roomId: this.roomId,
      color: this.color,
      model: this.model,
      provider: this.provider,
    });

    if (!response.success) {
      throw new Error(`Failed to register: ${response.error}`);
    }

    const data = response.data as {
      instanceId: string;
      token: string;
      roomId: string;
      name: string;
    };

    this.instanceId = data.instanceId;
    this.token = data.token;

    console.log(`✓ Registered as "${this.name}" in room "${data.roomId}"`);
    console.log(`  Instance ID: ${data.instanceId}`);

    return { instanceId: data.instanceId, token: data.token };
  }

  /**
   * Unregister from the Room Bridge Server
   */
  async unregister(): Promise<void> {
    if (!this.instanceId || !this.token) {
      return;
    }

    await this.httpPost('/unregister', {
      instanceId: this.instanceId,
      token: this.token,
    });

    console.log(`✓ Unregistered "${this.name}"`);

    this.stopInboxPolling();
    this.instanceId = null;
    this.token = null;
  }

  /**
   * Send a message to a specific agent
   */
  async sendMessage(toAgentId: string, content: string, type: 'task' | 'result' | 'question' = 'task'): Promise<void> {
    if (!this.instanceId || !this.token) {
      throw new Error('Not registered. Call register() first.');
    }

    const response = await this.httpPost(`/${this.instanceId}/message`, {
      fromAgentId: this.name,
      toAgentId,
      content,
      type,
      traceId: crypto.randomUUID(),
    }, this.token);

    if (!response.success) {
      throw new Error(`Failed to send message: ${response.error}`);
    }

    console.log(`→ Sent message to ${toAgentId}: "${content}"`);
  }

  /**
   * Broadcast a message to all agents in the room
   */
  async broadcastMessage(content: string, type: 'broadcast' | 'task' | 'question' = 'broadcast'): Promise<void> {
    if (!this.instanceId || !this.token) {
      throw new Error('Not registered. Call register() first.');
    }

    const response = await this.httpPost(`/${this.instanceId}/broadcast`, {
      fromAgentId: this.name,
      content,
      type,
      traceId: crypto.randomUUID(),
    }, this.token);

    if (!response.success) {
      throw new Error(`Failed to broadcast: ${response.error}`);
    }

    console.log(`→ Broadcast to room: "${content}"`);
  }

  /**
   * Start listening for incoming messages
   */
  startListening(onMessage: (message: { from: string; content: string; type: string }) => void): void {
    if (!this.instanceId || !this.token) {
      throw new Error('Not registered. Call register() first.');
    }

    console.log(`✓ Started listening for messages...`);

    // Poll inbox every 2 seconds
    this.inboxPollInterval = setInterval(() => {
      this.pollInbox(onMessage);
    }, 2000);
  }

  /**
   * Stop listening for messages
   */
  stopListening(): void {
    this.stopInboxPolling();
  }

  /**
   * Get list of all registered agents
   */
  async getAgents(): Promise<Array<{
    instanceId: string;
    name: string;
    tool: string;
    roomId: string;
    status: string;
  }>> {
    const response = await this.httpGet('/agents');

    if (!response.success) {
      return [];
    }

    return response.data as Array<{
      instanceId: string;
      name: string;
      tool: string;
      roomId: string;
      status: string;
    }>;
  }

  /**
   * Private: Poll inbox for new messages
   */
  private async pollInbox(onMessage: (message: { from: string; content: string; type: string }) => void): Promise<void> {
    if (!this.instanceId || !this.token) {
      return;
    }

    // Note: In a real implementation, you would use SSE instead of polling
    // This is a simplified example
    const url = `http://localhost:${BRIDGE_PORT}/${this.instanceId}/inbox`;

    try {
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.get(url, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
          },
        }, resolve);

        req.on('error', reject);
        req.setTimeout(1500);
      });

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        // Parse SSE format
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'room.message' && event.data) {
                const { fromAgentName, content, type } = event.data;
                
                // Avoid duplicate messages
                const messageId = event.data.id;
                if (messageId === this.lastMessageId) continue;
                this.lastMessageId = messageId;

                onMessage({
                  from: fromAgentName,
                  content,
                  type,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      });
    } catch (error) {
      // Polling errors are expected if no messages
    }
  }

  /**
   * Private: Stop inbox polling
   */
  private stopInboxPolling(): void {
    if (this.inboxPollInterval) {
      clearInterval(this.inboxPollInterval);
      this.inboxPollInterval = null;
    }
  }

  /**
   * Private: HTTP POST helper
   */
  private async httpPost(path: string, body: unknown, token?: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: BRIDGE_PORT,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve({ success: true, data: JSON.parse(data) });
              } catch {
                resolve({ success: true, data });
              }
            } else {
              resolve({ success: false, error: `HTTP ${res.statusCode}` });
            }
          });
        },
      );

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * Private: HTTP GET helper
   */
  private async httpGet(path: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return new Promise((resolve) => {
      http.get(
        {
          hostname: 'localhost',
          port: BRIDGE_PORT,
          path,
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve({ success: true, data: JSON.parse(data) });
              } catch {
                resolve({ success: true, data });
              }
            } else {
              resolve({ success: false, error: `HTTP ${res.statusCode}` });
            }
          });
        },
      ).on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * Private: Infer provider from tool name
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
}

/**
 * Example usage - Claude Code Agent
 */
async function exampleClaudeAgent() {
  console.log('\n🌉 External Agent Example — Claude Code\n');
  console.log('Make sure the Room Bridge Server is running:');
  console.log('  cast rooms --serve\n');

  // Check if server is running
  try {
    await new Promise<void>((resolve, reject) => {
      http.get(`http://localhost:${BRIDGE_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Server returned ${res.statusCode}`));
      }).on('error', reject);
    });
    console.log('✓ Room Bridge Server is running\n');
  } catch {
    console.log('✗ Room Bridge Server is not running');
    console.log('  Start it with: cast rooms --serve\n');
    return;
  }

  // Create Claude agent
  const claudeAgent = new ExternalAgentClient({
    name: 'Claude',
    tool: 'claude',
    roomId: 'bar',
    color: '#a78bfa',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
  });

  try {
    // Register
    await claudeAgent.register();

    // Start listening for messages
    claudeAgent.startListening((message) => {
      console.log(`\n📨 Received from ${message.from}: "${message.content}"\n`);
      
      // Auto-respond to questions
      if (message.type === 'question') {
        setTimeout(async () => {
          await claudeAgent.sendMessage(message.from, 'I received your question. Working on it...', 'result');
        }, 1000);
      }
    });

    // Wait a bit, then send a broadcast message
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await claudeAgent.broadcastMessage('Hello from Claude! Ready to collaborate.', 'broadcast');

    // Get list of agents
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const agents = await claudeAgent.getAgents();
    console.log('\n📋 Registered agents:');
    for (const agent of agents) {
      console.log(`   - ${agent.name} (${agent.tool}) in ${agent.roomId}`);
    }

    // Keep running for a bit to receive messages
    console.log('\n✓ Listening for messages... (Ctrl+C to exit)\n');

    // Cleanup on exit
    process.on('SIGINT', async () => {
      console.log('\nDisconnecting...');
      claudeAgent.stopListening();
      await claudeAgent.unregister();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

/**
 * Example usage - Codex Agent
 */
async function exampleCodexAgent() {
  console.log('\n🌉 External Agent Example — Codex\n');

  const codexAgent = new ExternalAgentClient({
    name: 'Codex',
    tool: 'codex',
    roomId: 'office',
    color: '#4ade80',
    model: 'gpt-4o',
    provider: 'openai',
  });

  try {
    await codexAgent.register();

    codexAgent.startListening((message) => {
      console.log(`\n📨 Received from ${message.from}: "${message.content}"\n`);
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await codexAgent.broadcastMessage('Codex online in the Office room.', 'broadcast');

    console.log('\n✓ Codex agent connected. Listening...\n');

    process.on('SIGINT', async () => {
      console.log('\nDisconnecting...');
      codexAgent.stopListening();
      await codexAgent.unregister();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

// Run example based on command line argument
const example = process.argv[2] ?? 'claude';

if (example === 'claude') {
  exampleClaudeAgent();
} else if (example === 'codex') {
  exampleCodexAgent();
} else {
  console.log('Usage: npx ts-node src/modules/rooms/examples/external-agent-example.ts [claude|codex]');
  process.exit(1);
}
