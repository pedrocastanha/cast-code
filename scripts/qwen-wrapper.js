#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const [roomId, agentName, ...qwenArgs] = process.argv.slice(2);

if (!roomId || !agentName) {
  console.error('Usage: qwen-wrapper <room> <agent-name> [qwen-args...]');
  process.exit(1);
}

const inboxPath = path.join(process.cwd(), '.cast', 'rooms',
  roomId.replace(/[^a-zA-Z0-9-_]/g, '_'),
  `${agentName.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`
);

console.error(`[qwen-wrapper] Room: ${roomId}, Agent: ${agentName}`);
console.error(`[qwen-wrapper] Inbox: ${inboxPath}`);

let lastMessageId = null;
let messageQueue = [];
let isProcessing = false;

function checkInbox() {
  try {
    if (!fs.existsSync(inboxPath)) {
      return;
    }

    const content = fs.readFileSync(inboxPath, 'utf-8');
    const messages = JSON.parse(content);

    const unread = messages.filter(m => !m.read && m.id !== lastMessageId);

    if (unread.length > 0) {
      for (const msg of unread) {
        console.error(`[qwen-wrapper] New message from ${msg.fromAgentName}: ${msg.content}`);
        messageQueue.push(msg);
        lastMessageId = msg.id;
        msg.read = true;
      }
      fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[qwen-wrapper] Inbox check error:', err.message);
  }
}

function startQwenWithMessage(message, callback) {
  console.error('[qwen-wrapper] Starting qwen with message...');
  
  const qwen = spawn('qwen', [...qwenArgs, '--prompt', message], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let output = '';

  const rl = readline.createInterface({
    input: qwen.stdout,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    output += line + '\n';
    process.stdout.write(line + '\n');
  });

  qwen.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  qwen.on('close', (code) => {
    console.error(`[qwen-wrapper] qwen exited with code ${code}`);
    if (callback) callback(code === 0);
  });

  qwen.on('error', (err) => {
    console.error('[qwen-wrapper] qwen error:', err.message);
    if (callback) callback(false);
  });
}

function processQueue() {
  if (isProcessing || messageQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const msg = messageQueue.shift();
  
  const prompt = `You are ${agentName}, an AI assistant in room ${roomId}.

Context: You received a message from ${msg.fromAgentName}.

[MESSAGE from ${msg.fromAgentName}]: ${msg.content}

Please respond to this message. Be helpful and concise.`;

  startQwenWithMessage(prompt, (success) => {
    isProcessing = false;
    setTimeout(() => processQueue(), 1000);
  });
}

// Check inbox periodically
setInterval(() => {
  checkInbox();
  processQueue();
}, 2000);

// Initial check
setTimeout(() => {
  checkInbox();
  processQueue();
}, 500);

console.error('[qwen-wrapper] Started, monitoring inbox...');

// Keep process alive
process.on('SIGINT', () => {
  console.error('[qwen-wrapper] Shutting down...');
  process.exit(0);
});

// Prevent exit
setInterval(() => {}, 10000);
