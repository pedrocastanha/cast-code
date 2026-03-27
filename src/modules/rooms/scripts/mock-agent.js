const readline = require('readline');

/**
 * Mock Agent for testing Bridge communication
 * 
 * It reads from STDIN and replies after a delay.
 * It simulates a "Thinking" state by logging patterns.
 */

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

const NAME = process.env.AGENT_NAME || 'MockNode';
const ROLE = process.env.AGENT_ROLE || 'Assistant';

console.log(`[${NAME}] Started in reactive mode...`);

// Initial greeting
setTimeout(() => {
  console.log(`Hello room! I am ${NAME}, the ${ROLE}. Waiting for tasks...`);
}, 1000);

rl.on('line', (line) => {
  if (!line.trim()) return;

  // Simulate "Thinking"
  console.log(`[Thinking] Analyzing message: "${line}"...`);
  
  // Wait a bit to respond
  const delay = 1500 + Math.random() * 2000;
  
  setTimeout(() => {
    const responses = [
      `Entendido! Vou analisar o "${line}" agora mesmo.`,
      `Interessante... O que você acha de usarmos React para resolver isso?`,
      `Estou verificando os logs... parece tudo certo por aqui.`,
      `Alguém chamou? Ah, oi! No que posso ajudar com "${line}"?`,
      `Faz sentido. Processando agora...`,
      `Feito! Acabei de rodar os testes e passaram.`
    ];

    const reply = responses[Math.floor(Math.random() * responses.length)];
    console.log(reply);
  }, delay);
});
