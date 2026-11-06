# Texpad

A one-equation LaTeX editor. It renders math with MathJax and downloads white-background PDF, PNG, and JPG files in the browser.

## Run locally

```sh
npm ci
npm run dev
```

The Vite base path is `/texpad/` for GitHub Pages. Open the URL printed by Vite.

## Publish

The `main` branch deploys through `.github/workflows/pages.yml` after GitHub Pages is configured to use GitHub Actions.
