import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { BenchmarkRouteDiscoveryService } = require('../dist/modules/benchmark/services/benchmark-route-discovery.service.js');
const { BenchmarkTargetService } = require('../dist/modules/benchmark/services/benchmark-target.service.js');

const root = await mkdtemp(join(tmpdir(), 'cast-benchmark-discovery-smoke-'));
await mkdir(join(root, 'src'), { recursive: true });
await writeFile(
  join(root, 'src/chat.ts'),
  `router.post('/chat', (req, res) => res.json({ answer: req.body.message + ' expected-quality' }))`,
);

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat') {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }

  const body = JSON.parse(raw || '{}');
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ answer: `${body.message} expected-quality` }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

try {
  const discovery = new BenchmarkRouteDiscoveryService();
  const candidates = await discovery.discoverFile(join(root, 'src/chat.ts'), {
    projectRoot: root,
    source: 'explicit',
    query: 'POST /chat',
    baseUrl: `http://127.0.0.1:${port}`,
  });

  const target = new BenchmarkTargetService();
  const result = await target.execute({
    target: candidates[0].target,
    benchmarkCase: { id: 'case-1', input: 'hello' },
  });

  if (!result.output.includes('expected-quality')) {
    throw new Error(`Unexpected output: ${result.output}`);
  }

  console.log('BENCHMARK_DISCOVERY_SMOKE_OK', JSON.stringify({
    candidates: candidates.length,
    output: result.output,
  }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
