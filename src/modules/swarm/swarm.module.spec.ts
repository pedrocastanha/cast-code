import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ToolsModule } from '../tools/tools.module';
import { ShellToolsService } from '../tools/services/shell-tools.service';

describe('SwarmModule dependencies', () => {
  test('ToolsModule exports shell tools for isolated swarm workers', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ToolsModule) as unknown[];
    assert(exports.includes(ShellToolsService));
  });
});
