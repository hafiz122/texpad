import assert from 'node:assert/strict';
import catalog from '../src/neovim-themes.json' with { type: 'json' };
import { contrast, getTheme } from '../src/site-theme.js';

assert.equal(catalog.length, 88);
assert.equal(new Set(catalog.map((theme) => theme.name)).size, 88);
assert.deepEqual(
  Object.fromEntries(['Neovim', 'Lvim', 'Mini', 'Tokyo Night'].map((family) =>
    [family, catalog.filter((theme) => theme.family === family).length])),
  { Neovim: 28, Lvim: 48, Mini: 7, 'Tokyo Night': 5 },
);

for (const entry of catalog) {
  const { colors, site } = getTheme(entry.name);
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
  const siteSurfaces = ['page', 'shell', 'header', 'panel', 'heading', 'field', 'status', 'button', 'buttonHover', 'buttonActive'];
  for (const surface of siteSurfaces) {
    for (const key of ['foreground', 'muted', 'accent', 'error']) {
      assert.ok(contrast(site[key], site[surface]) >= 4.5, `${entry.name}: site ${key} on ${surface}`);
    }
    assert.ok(contrast(site.border, site[surface]) >= 3, `${entry.name}: site border on ${surface}`);
  }
}

console.log('Validated 88 themes, 4 groups, and readable colors.');
