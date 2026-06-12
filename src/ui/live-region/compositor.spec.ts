import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LiveRegionCompositor, LiveBlock } from './compositor';

class FakeOut {
  data = '';
  isTTY = true;
  columns = 40;
  write = (s: string) => {
    this.data += s;
  };
  reset() {
    this.data = '';
  }
}

function staticBlock(id: string, lines: string[]): LiveBlock {
  return { id, render: () => lines };
}

describe('LiveRegionCompositor', () => {
  test('first repaint writes all block lines in order', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['line-a']));
    c.addBlock(staticBlock('b', ['line-b1', 'line-b2']));
    c.repaint();
    assert.match(out.data, /line-a/);
    assert.match(out.data, /line-b1/);
    assert.match(out.data, /line-b2/);
    assert.equal(
      out.data.indexOf('line-a') < out.data.indexOf('line-b1'),
      true,
    );
  });

  test('second repaint moves cursor up to region start and clears', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['one', 'two', 'three']));
    c.repaint();
    out.reset();
    c.repaint();
    // cursor parked on last line (row 2 of 3) → up 2 to region top
    assert.match(out.data, /\x1b\[2A/);
    assert.match(out.data, /\x1b\[0J/);
  });

  test('scrollOut writes content above the region', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['input-box']));
    c.repaint();
    out.reset();
    c.scrollOut('finished work\r\n');
    const i = out.data.indexOf('finished work');
    const j = out.data.lastIndexOf('input-box');
    assert.equal(i >= 0 && j > i, true);
  });

  test('setCursor positions hardware cursor inside the focused block', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('tree', ['t1', 't2']));
    c.addBlock(staticBlock('input', ['i1', 'i2', 'i3']));
    c.setCursor('input', 1, 4); // row 1 within input block → absolute row 3 of 5
    c.repaint();
    // 5 lines written, cursor ends on absolute row 3: up (5-1-3)=1, col 5
    assert.match(out.data, /\x1b\[1A/);
    assert.match(out.data, /\x1b\[5G/);
  });

  test('removeBlock drops its lines on next repaint', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['aaa']));
    c.addBlock(staticBlock('b', ['bbb']));
    c.repaint();
    c.removeBlock('a');
    out.reset();
    c.repaint();
    assert.equal(out.data.includes('aaa'), false);
    assert.match(out.data, /bbb/);
  });

  test('clear erases the region and forgets state', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['xx', 'yy']));
    c.repaint();
    out.reset();
    c.clear();
    assert.match(out.data, /\x1b\[0J/);
    out.reset();
    c.repaint();
    // after clear, repaint must not move up (no previous region)
    assert.equal(/\x1b\[\d+A/.test(out.data), false);
  });

  test('non-TTY output disables painting; scrollOut still writes content', () => {
    const out = new FakeOut();
    out.isTTY = false;
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['hidden']));
    c.repaint();
    assert.equal(out.data, '');
    c.scrollOut('plain\r\n');
    assert.equal(out.data, 'plain\r\n');
  });

  test('render exceptions degrade to append-only instead of throwing', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock({
      id: 'bad',
      render: () => {
        throw new Error('boom');
      },
    });
    assert.doesNotThrow(() => c.repaint());
    c.scrollOut('still works\r\n');
    assert.match(out.data, /still works/);
  });
});
