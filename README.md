# Texpad

A one-equation LaTeX editor. It renders math with MathJax and downloads white-background PDF, PNG, and JPG files in the browser.

Oversized equations shrink to fit the preview. The fit percentage appears beside the preview title; downloads keep the original equation size.

Select **Vim mode** beside the equation field for Vim keybindings and an animated cursor trail. Press `i` to insert text and `Esc` to return to normal mode. Switching modes keeps the equation and preview. The trail is disabled when the device requests reduced motion.

Vim mode has 88 bundled Neovim colorschemes. The theme picker changes only the Vim editor and remembers its choice in this browser. The catalog is a snapshot of Neovim 0.12.3 and the installed Lvim, Mini, and Tokyo Night plugins; the public site does not read visitors' Neovim installations. The `randomhue` entry uses one captured palette. To refresh the snapshot on a machine with those packages, run:

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
