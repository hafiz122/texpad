import assert from 'node:assert/strict';
import catalog from '../src/neovim-themes.json' with { type: 'json' };
import { contrast, getTheme } from '../src/vim-theme.js';

assert.equal(catalog.length, 88);
assert.equal(new Set(catalog.map((theme) => theme.name)).size, 88);
assert.deepEqual(
  Object.fromEntries(['Neovim', 'Lvim', 'Mini', 'Tokyo Night'].map((family) =>
    [family, catalog.filter((theme) => theme.family === family).length])),
  { Neovim: 28, Lvim: 48, Mini: 7, 'Tokyo Night': 5 },
);

for (const entry of catalog) {
  const colors = getTheme(entry.name).colors;
  for (const [key, value] of Object.entries(colors)) {
    assert.match(value, /^#[0-9a-f]{6}$/i, `${entry.name}: ${key}`);
  }
  for (const background of [colors.background, colors.activeLine, colors.selection]) {
    for (const key of ['foreground', 'command', 'environment', 'text', 'comment', 'delimiter', 'operator', 'number', 'cursor']) {
      assert.ok(contrast(colors[key], background) >= 4.5, `${entry.name}: ${key} contrast`);
    }
  }
  for (const background of [colors.gutterBackground, colors.gutterActiveLine]) {
    assert.ok(contrast(colors.gutterForeground, background) >= 4.5, `${entry.name}: gutter contrast`);
  }
  assert.ok(contrast(colors.statusForeground, colors.statusBackground) >= 4.5, `${entry.name}: status contrast`);
}

console.log('Validated 88 themes, 4 groups, and readable colors.');
