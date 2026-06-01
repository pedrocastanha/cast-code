#!/usr/bin/env node
import readline from 'node:readline';
import { appendFileSync } from 'node:fs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
let turnBuffer = '';
let resultBuffer = '';
let keepAliveTimer;
const responseDelayMs = Number(process.env.FAKE_CLAUDE_DELAY_MS || 20);

const debug = (value) => {
  if (process.env.FAKE_CLAUDE_DEBUG_FILE) {
    appendFileSync(process.env.FAKE_CLAUDE_DEBUG_FILE, `${value}\n`);
  }
};

const emit = (value) => {
  debug(`emit ${value}`);
  process.stdout.write(`${value}\n`);
};

const emitBatch = (...values) => {
  values.forEach((value, index) => {
    setTimeout(() => emit(value), responseDelayMs * (index + 1));
  });
};

const handleTurn = (text) => {
  if (process.env.FAKE_CLAUDE_MODE === 'malformed') {
    emitBatch('<cast_tool_call id="bad">{not-json}</cast_tool_call>');
    return;
  }

  if (text.includes('package.json')) {
    emitBatch('<cast_tool_call id="call_pkg">{"name":"read_file","arguments":{"path":"package.json"}}</cast_tool_call>');
    return;
  }

  if (/node --version|typecheck/.test(text)) {
    emitBatch('<cast_tool_call id="call_shell">{"name":"shell","arguments":{"command":"node --version"}}</cast_tool_call>');
    return;
  }

  emitBatch('Fake Claude received the turn.<cast_turn_done/>');
};

const handleResult = (text) => {
  if (text.includes('protocol_error') || text.includes('Malformed tool call')) {
    emitBatch('Protocol error handled by fake Claude.', '<cast_turn_done/>');
    return;
  }

  if (text.includes('call_pkg')) {
    emitBatch('Scripts: build, test, typecheck', '<cast_turn_done/>');
    return;
  }

  if (text.includes('call_shell')) {
    emitBatch('Node version returned by Cast shell.', '<cast_turn_done/>');
  }
};

rl.on('line', (line) => {
  const text = line.toString();
  debug(`line ${text}`);

  if (text.includes('You are running inside Cast Bridge')) {
    emitBatch('<cast_bridge_ready provider="claude"/>');
    return;
  }

  if (turnBuffer || text.includes('<cast_user_turn')) {
    turnBuffer += `${text}\n`;
    if (text.includes('</cast_user_turn>')) {
      const completed = turnBuffer;
      turnBuffer = '';
      handleTurn(completed);
    }
    return;
  }

  if (resultBuffer || text.includes('<cast_tool_result')) {
    resultBuffer += `${text}\n`;
    if (text.includes('</cast_tool_result>')) {
      const completed = resultBuffer;
      resultBuffer = '';
      handleResult(completed);
    }
  }
});

rl.on('close', () => {
  debug('close');
});

if (process.env.FAKE_CLAUDE_AUTORESPOND === '1') {
  const toolDelayMs = Number(process.env.FAKE_CLAUDE_AUTORESPOND_TOOL_DELAY_MS || 1500);
  const doneDelayMs = Number(process.env.FAKE_CLAUDE_AUTORESPOND_DONE_DELAY_MS || 2300);
  keepAliveTimer = setInterval(() => {}, 1000);
  setTimeout(() => {
    if (process.env.FAKE_CLAUDE_MODE === 'malformed') {
      emit('<cast_tool_call id="bad">{not-json}</cast_tool_call>');
      return;
    }
    emit('<cast_tool_call id="call_pkg">{"name":"read_file","arguments":{"path":"package.json"}}</cast_tool_call>');
  }, toolDelayMs);
  setTimeout(() => {
    if (process.env.FAKE_CLAUDE_MODE === 'malformed') {
      emit('Protocol error handled by fake Claude.');
    } else {
      emit('Scripts: build, test, typecheck');
    }
    emit('<cast_turn_done/>');
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
    }
  }, doneDelayMs);
}
