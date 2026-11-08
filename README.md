# Texpad

Texpad has three workspaces: a one-equation LaTeX editor, a bell-curve drawer, and a study-notes editor. Equations and notes render math with MathJax.

**Equation** downloads one equation as a white-background PDF, PNG, or JPG. Oversized equations shrink to fit the preview; downloads keep the original equation size.

**Bell curve** draws a normal distribution from a mean and standard deviation. The horizontal axis spans four standard deviations on each side of the mean. Use **Insert into LaTeX note** to add a vector graph before `\end{document}` in the current note; the generated source uses standard LaTeX `picture` commands and needs no plotting package. You can also download the standalone graph as a white-background PDF, PNG, or JPG.

**Notes** at `#notes` supports multiple named drafts. Choosing Study notes, Problem set, Article, or Blank Markdown in the Template picker opens that template immediately. An untouched template draft changes in place; an edited draft is kept while a new draft opens. LaTeX notes start with a full preamble. The browser compiles them with pdfLaTeX and shows the PDF in a built-in viewer with page navigation and zoom controls. Export the `.tex` source or the compiled PDF, or import a `.tex` file. The bundled TeX Live core includes common packages such as `amsmath` and `amssymb`; a package outside that bundle produces a compilation error.

In a LaTeX note, **Add bell curve** inserts an editable standard-normal LaTeX `picture` block at the cursor (or before `\end{document}` if the cursor is outside the document body). Use the Bell curve workspace to choose other mean and standard-deviation values before inserting its graph.

On desktop, Texpad fills the browser window. Drag the divider between the source and preview to resize them, or focus it and use the arrow, Home, and End keys. The split is remembered in this browser. On phones, use the Edit and Preview tabs.

Choose **Blank Markdown** for the earlier Markdown editor. It supports `$...$` inline math and `$$...$$` display math, `.md` import/export, and **Print / Save PDF** through the browser print dialog. The Markdown preview and print layout use Latin Modern Roman, a Computer Modern variant; MathJax uses New Computer Modern for math. All notes autosave in this browser's IndexedDB. Notes do not sync between devices, and clearing site data can erase local drafts, so download source files for backups.

The equation and notes workspaces offer optional Vim editing with an animated cursor trail. Press `i` to insert text and `Esc` to return to normal mode. The trail is disabled when the device requests reduced motion.

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
