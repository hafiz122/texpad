# Texpad

Texpad has two workspaces: a one-equation LaTeX editor and a study-notes editor. Both render math with MathJax.

**Equation** downloads one equation as a white-background PDF, PNG, or JPG. Oversized equations shrink to fit the preview; downloads keep the original equation size.

**Notes** at `#notes` supports multiple named Markdown drafts with `$...$` inline math and `$$...$$` display math. Notes autosave in this browser's IndexedDB. Use **Download Markdown** for an editable backup and **Import Markdown** to restore a file. **Print / Save PDF** opens the browser's print dialog with a white A4 document. Notes do not sync between devices, and clearing site data can erase local drafts.

Both workspaces offer optional Vim editing with an animated cursor trail. Press `i` to insert text and `Esc` to return to normal mode. The trail is disabled when the device requests reduced motion.

The Theme picker has 88 bundled Neovim colorschemes. A choice colors the whole page, including the editor and math preview, and is remembered in this browser. Downloaded equations keep a white background. The catalog is a snapshot of Neovim 0.12.3 and the installed Lvim, Mini, and Tokyo Night plugins; the public site does not read visitors' Neovim installations. The `randomhue` entry uses one captured palette. To refresh the snapshot on a machine with those packages, run:

```sh
nvim --headless -u NONE -i NONE -c 'luafile scripts/export-neovim-themes.lua' +qa
```

## Run locally

```sh
npm ci
npm run dev
```

The Vite base path is `/texpad/` for GitHub Pages. Open the URL printed by Vite.

## Publish

The `main` branch deploys through `.github/workflows/pages.yml` after GitHub Pages is configured to use GitHub Actions.
