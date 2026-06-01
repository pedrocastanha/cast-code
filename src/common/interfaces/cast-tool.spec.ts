import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { z } from 'zod';
import { castTool, toolToDefinition, type CastTool } from './cast-tool.interface';

describe('castTool', () => {
  test('creates a tool with name, description, schema, execute', async () => {
    const schema = z.object({ x: z.number() });
    const t = castTool(async ({ x }) => `result: ${x}`, {
      name: 'add_one',
      description: 'Adds one',
      schema,
    });

    assert.equal(t.name, 'add_one');
    assert.equal(t.description, 'Adds one');
    assert.equal(await t.execute({ x: 5 }), 'result: 5');
  });

  test('execute receives validated input', async () => {
    const schema = z.object({ msg: z.string() });
    const t = castTool(async ({ msg }) => msg.toUpperCase(), {
      name: 'upper',
      description: 'Uppercase',
      schema,
    });

    assert.equal(await t.execute({ msg: 'hello' }), 'HELLO');
  });

  test('keeps invoke as an execute alias for existing tool consumers', async () => {
    const schema = z.object({ name: z.string() });
    const t = castTool(async ({ name }) => `hello ${name}`, {
      name: 'hello',
      description: 'Greets',
      schema,
    });

    assert.equal(await t.invoke({ name: 'cast' }), 'hello cast');
  });
});

describe('toolToDefinition', () => {
  test('converts zod schema to JSON Schema parameters', () => {
    const schema = z.object({
      path: z.string().describe('File path'),
      offset: z.number().optional().describe('Line offset'),
    });
    const t: CastTool = castTool(async () => '', { name: 'read_file', description: 'Reads a file', schema });
    const def = toolToDefinition(t);

    assert.equal(def.name, 'read_file');
    assert.equal(def.description, 'Reads a file');
    assert.equal(def.parameters.type, 'object');
    assert.deepEqual((def.parameters as any).properties.path, { type: 'string', description: 'File path' });
    assert.deepEqual((def.parameters as any).properties.offset, { type: 'number', description: 'Line offset' });
    assert.deepEqual(def.parameters.required, ['path']);
  });

  test('handles enum fields', () => {
    const schema = z.object({ mode: z.enum(['read', 'write']) });
    const t = castTool(async () => '', { name: 'fs', description: 'FS op', schema });
    const def = toolToDefinition(t);

    assert.deepEqual((def.parameters as any).properties.mode.enum, ['read', 'write']);
  });
});
