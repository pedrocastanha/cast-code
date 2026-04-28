import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getKanbanHtml } from './kanban-ui';

describe('getKanbanHtml', () => {
  test('uses the shared Cast shell and board layout', () => {
    const html = getKanbanHtml();

    assert.match(html, /class="cast-terminal kanban-terminal"/);
    assert.match(html, /class="board"/);
    assert.match(html, /class="column-header"/);
    assert.match(html, /class="modal-overlay" id="modalOverlay"/);
  });

  test('inherits Cast theme tokens instead of the previous premium dark theme', () => {
    const html = getKanbanHtml();

    assert.match(html, /--bg-deep:\s*#040b16/i);
    assert.match(html, /--accent-mid:\s*#38bdf8/i);
    assert.doesNotMatch(html, /Premium Dark Mode Colors/);
    assert.doesNotMatch(html, /font-family:\s*'Inter'/i);
  });
});
