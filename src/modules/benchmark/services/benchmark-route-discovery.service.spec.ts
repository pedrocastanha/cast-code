import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { BenchmarkRouteDiscoveryService } from './benchmark-route-discovery.service';

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cast-benchmark-discovery-'));
}

describe('BenchmarkRouteDiscoveryService', () => {
  test('discovers Express router endpoints from one explicit file', async () => {
    const root = await fixtureRoot();
    const file = join(root, 'src/routes/chat.ts');
    await mkdir(join(root, 'src/routes'), { recursive: true });
    await writeFile(file, `
      import { Router } from 'express';
      export const router = Router();
      router.post('/chat', async (req, res) => res.json({ answer: req.body.message }));
    `);

    const service = new BenchmarkRouteDiscoveryService();
    const candidates = await service.discoverFile(file, {
      projectRoot: root,
      source: 'explicit',
      query: 'POST /chat',
      baseUrl: 'http://localhost:3000',
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].method, 'POST');
    assert.equal(candidates[0].routePath, '/chat');
    assert.equal(candidates[0].target.config.url, 'http://localhost:3000/chat');
    assert.deepEqual(candidates[0].target.config.body, { message: '{{input}}' });
  });

  test('discovers NestJS controller endpoints', async () => {
    const root = await fixtureRoot();
    const file = join(root, 'src/chat.controller.ts');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(file, `
      import { Body, Controller, Post } from '@nestjs/common';
      @Controller('api')
      export class ChatController {
        @Post('chat')
        create(@Body('message') message: string) {
          return { answer: message };
        }
      }
    `);

    const service = new BenchmarkRouteDiscoveryService();
    const candidates = await service.discoverFile(file, { projectRoot: root, source: 'explicit' });

    assert.equal(candidates[0].method, 'POST');
    assert.equal(candidates[0].routePath, '/api/chat');
    assert.equal(candidates[0].handlerName, 'create');
  });

  test('discovers Next.js app route handlers', async () => {
    const root = await fixtureRoot();
    const file = join(root, 'app/api/campaigns/generate/route.ts');
    await mkdir(join(root, 'app/api/campaigns/generate'), { recursive: true });
    await writeFile(file, `
      export async function POST(request: Request) {
        const body = await request.json();
        return Response.json({ answer: body.input });
      }
    `);

    const service = new BenchmarkRouteDiscoveryService();
    const candidates = await service.discoverFile(file, { projectRoot: root, source: 'explicit' });

    assert.equal(candidates[0].method, 'POST');
    assert.equal(candidates[0].routePath, '/api/campaigns/generate');
  });

  test('project discovery skips heavy folders and finds OpenAPI paths', async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, 'node_modules/ignored'), { recursive: true });
    await writeFile(join(root, 'openapi.json'), JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/chat': {
          post: {
            operationId: 'chat',
          },
        },
      },
    }));
    await writeFile(join(root, 'node_modules/ignored/router.ts'), `router.post('/ignored', handler)`);

    const service = new BenchmarkRouteDiscoveryService();
    const candidates = await service.discoverProject(root);

    assert(candidates.some((candidate) => candidate.routePath === '/chat'));
    assert(!candidates.some((candidate) => candidate.routePath === '/ignored'));
  });
});
