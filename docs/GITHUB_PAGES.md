# GitHub Pages deployment

DuckDB Explorer includes `.github/workflows/deploy-pages.yml`, which rebuilds the standalone app from pinned dependencies and publishes `dist/`.

## One-time setup

1. Push the repository to GitHub as `ttomohisa/htmlapps-duckdb-explorer`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` or run **Deploy standalone app to GitHub Pages** manually.

The workflow first runs `scripts/check-repository.ps1`. Deployment continues only after repository contracts and the standalone build pass.

## Published URL

`https://ttomohisa.github.io/htmlapps-duckdb-explorer/`

## Local-processing note

Opening the GitHub Pages URL requires the initial HTML request. After the app has loaded, selected DuckDB files are processed in the browser and are not uploaded by the app. The generated app uses `connect-src 'none'`, so app runtime operations do not use external HTTP/HTTPS/WebSocket connections.

For use with the network completely disconnected, open a generated `dist/index.html` directly.

## Troubleshooting

If the workflow says Pages is not enabled, repeat the one-time setup and re-run the workflow. If the build fails, run `build-standalone.bat` locally on Windows and fix the first reported release or build check before deploying again.
