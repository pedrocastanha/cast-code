import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getRemoteHtml } from './remote-ui';

describe('getRemoteHtml', () => {
  test('uses the shared Cast shell structure', () => {
    const html = getRemoteHtml();

    assert.match(html, /class="cast-terminal remote-terminal"/);
    assert.match(html, /class="remote-sidebar"/);
    assert.match(html, /class="remote-main"/);
    assert.match(html, /class="remote-statusbar"/);
  });

  test('keeps auth, palette, and input surfaces inside the redesign', () => {
    const html = getRemoteHtml();

    assert.match(html, /id="auth-screen"/);
    assert.match(html, /id="cmd-palette"/);
    assert.match(html, /class="input-shell-label">Input</);
    assert.match(html, /voice \+ streaming enabled/);
  });

  test('injects shared Cast CSS tokens', () => {
    const html = getRemoteHtml();

    assert.match(html, /--bg-deep:\s*#040b16/i);
    assert.match(html, /--accent-mid:\s*#38bdf8/i);
    assert.match(html, /--sidebar-width:\s*280px/i);
  });
});
