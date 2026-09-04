# Offline Verification — DuckDB Explorer

## Prepare once

Run `build-standalone.bat` on Windows while online at least once. This resolves the pinned npm build inputs and downloads the pinned `htmlapps-duckdb-wasm-builder` v0.1.2 `explorer-minimal` GitHub Release artifact. The Release ZIP and its extracted matched runtime are stored only under `.cache/` and are not part of the repository release ZIP.

`build-standalone.bat` verifies the Builder Release archive SHA-256, Builder manifest, browser smoke-test record, and the API / Worker / WASM hashes before embedding them.

## Runtime offline checks

1. Open `dist/index.html` directly from Explorer (`file://`).
2. Open browser developer tools and clear the Network panel.
3. Enable offline mode or disconnect the device.
4. Reload the local HTML.
5. Open `test-data/browser-kitty-sample.duckdb`.
6. Confirm the database overview appears before any table/view is selected.
7. Confirm file size, schema/table/view/column counts, DuckDB version, and the object list appear.
8. Open `main.orders`; verify 250 rows and move between pages.
9. Search `main.odd names` for `100%_complete`; confirm `%` and `_` are literal.
10. Filter `main.customers` by `country contains Japan`, then test `email is NULL`.
11. Inspect MAP / STRUCT / LIST / BLOB / NULL values in detail dialogs.
12. Use `analytics.profile_cases` and analyze `category`, `score`, `event_date`, and `all_null`.
13. Save the visible page as CSV and JSON and confirm only that page is included.
14. Run a read-only SQL aggregation and Explain.
15. Confirm `UPDATE`, `DROP`, `ATTACH`, `INSTALL`, `LOAD`, and multiple statements are rejected.
16. Save a SQL result as CSV/JSON and confirm no more than 1,000 rows are retained.
17. Save the data dictionary HTML; confirm it contains metadata and completed profiles but no table rows.
18. Compare `browser-kitty-sample.duckdb` with `browser-kitty-sample-after.duckdb` and confirm structural differences appear.
19. Switch Japanese / English and repeat the main flow at a smartphone viewport.
20. Confirm there is no horizontal page scroll and bottom navigation does not cover content.
21. Confirm DevTools Network has no HTTP, HTTPS, WebSocket, analytics, CDN, or DuckDB WASM fetch caused by app operation.

## Large-data sanity checks

- Search input is debounced.
- Opening a database does not exact-count every table.
- Only the selected relation is counted exactly.
- Column analysis runs only after explicit user action and is cached.
- Viewer CSV / JSON exports only the loaded page.
- SELECT / WITH / VALUES SQL results are capped by the outer 1,001-row query and only 1,000 rows are retained.
- SQL history stays memory-only and is capped at 20 entries.
- Data dictionary generation reads metadata and cached profiles only.

## CSP note

The app uses `connect-src 'none'`. Embedded DuckDB WASM bytes are transferred into the Worker as an ArrayBuffer and served through an in-worker Response bridge, so the Worker does not fetch a `blob:null/...` WASM URL. `worker-src blob:` remains necessary to start the embedded Worker.

## Self-extracting variant

Repeat the same checks with `dist/index.self-extract.html`. Confirm the loader finishes, the favicon matches, and no decompression/CSP error appears.

## DuckDB session hardening

Verify the source applies `autoinstall_known_extensions=false`, `autoload_known_extensions=false`, `allow_community_extensions=false`, and attempts `enable_external_access=false`, while CSP permits no external network scheme.

## Pinned Builder runtime provenance

After `build-standalone.bat`, confirm:

- `dist/dependency-manifest.json` contains `duckdbWasmOverride` with Builder `0.1.2`, profile `explorer-minimal`, and browser smoke test `passed`.
- `dist/duckdb-wasm-build-manifest.json` exists and its SHA-256 matches `duckdb-wasm-runtime.lock.json`.
- `dist/duckdb-wasm-verification.json` reports passed browser smoke tests.
- API / Worker / WASM SHA-256 values in the dependency manifest match the runtime lock.

The Builder GitHub Release download is a build-time operation only. It must not create a runtime network dependency in the generated HTML.
