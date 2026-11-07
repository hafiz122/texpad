# Texpad

Texpad has two workspaces: a one-equation LaTeX editor and a study-notes editor. Both render math with MathJax.

**Equation** downloads one equation as a white-background PDF, PNG, or JPG. Oversized equations shrink to fit the preview; downloads keep the original equation size.

**Notes** at `#notes` supports multiple named drafts. New notes start from a full LaTeX preamble template: Study notes, Problem set, or Article. The browser compiles these documents with pdfLaTeX and shows the real PDF in the preview. Export the `.tex` source or the compiled PDF, or import a `.tex` file. The bundled TeX Live core includes common packages such as `amsmath` and `amssymb`; a package outside that bundle produces a compilation error.

On desktop, Texpad fills the browser window. Drag the divider between the source and preview to resize them, or focus it and use the arrow, Home, and End keys. The split is remembered in this browser. On phones, use the Edit and Preview tabs.

Choose **Blank Markdown** for the earlier Markdown editor. It supports `$...$` inline math and `$$...$$` display math, `.md` import/export, and **Print / Save PDF** through the browser print dialog. The Markdown preview and print layout use Latin Modern Roman, a Computer Modern variant; MathJax uses New Computer Modern for math. All notes autosave in this browser's IndexedDB. Notes do not sync between devices, and clearing site data can erase local drafts, so download source files for backups.

Both workspaces offer optional Vim editing with an animated cursor trail. Press `i` to insert text and `Esc` to return to normal mode. The trail is disabled when the device requests reduced motion.

The browser TeX engine is [TeX Live WASM](https://github.com/typeward/texlive-wasm) 0.2.4-alpha. Its bundled engine and core files retain their upstream TeX Live licenses in `public/texlive-wasm/pdflatex/emscripten/`. Latin Modern Roman web fonts come from [Latin Modern Web](https://github.com/sugina-dev/latin-modern-web); their GUST license is in `src/fonts/LICENSE.md`.

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
