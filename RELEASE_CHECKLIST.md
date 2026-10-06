# DuckDB Explorer release checklist

Use this checklist for the v1.0.1 release and later release candidates.

## Build and repository

- [ ] `build-standalone.bat -ForceDownload` completes on Windows PowerShell without syntax errors and freshly downloads the pinned Builder Release artifact.
- [ ] The build downloads or reuses the pinned `htmlapps-duckdb-wasm-builder` v0.1.2 GitHub Release archive defined in `duckdb-wasm-runtime.lock.json`.
- [ ] The Release archive SHA-256 matches `d6a04fb3acca409de2343e0139a221b6b4d76734f4cfc5afe1b6dfa507b4e480`.
- [ ] The matched browser API / EH Worker / WASM and Builder manifest hashes match the runtime lock.
- [ ] `dependencies.lock.json` contains the pinned `@duckdb/duckdb-wasm` 1.32.0 and `apache-arrow` 17.0.0 entries.
- [ ] `dist/index.html`, `dist/index.self-extract.html`, `dist/dependency-manifest.json`, `dist/build-size-report.json`, `dist/self-extract-manifest.json`, `dist/duckdb-wasm-build-manifest.json`, `dist/duckdb-wasm-verification.json`, and `dist/.nojekyll` are generated.
- [ ] `dist/dependency-manifest.json` contains `duckdbWasmOverride` for Builder v0.1.2 / `explorer-minimal` and browser smoke test `passed`.
- [ ] Historical `prepare-v*.bat`, `scripts/prepare-v*.ps1`, `scripts/check-v*.ps1`, generated verification packs, `.cache`, `__pycache__`, and `*.pyc` are not included in the release repository/ZIP.
- [ ] `assets/screenshot.png` and `assets/screenshot-en.png` are current; duplicate `screenshot-ja.png` is not kept.

## PC

- [ ] Initial page matches the Browser Kitty / SQLite Explorer header and landing-page pattern.
- [ ] Header shows `v1.0.1`.
- [ ] Header filename remains readable with a long database filename.
- [ ] No horizontal page scroll appears at common desktop widths.
- [ ] Overview is the first content view after opening a database.
- [ ] Sidebar/object tree remains usable with long schema/table/view names.
- [ ] Data, Columns, SQL, comparison, dialogs, and saved-result actions do not overlap.

## Smartphone

- [ ] Test at approximately 390 × 844 and 360 × 800 CSS pixels.
- [ ] No horizontal page scroll.
- [ ] Bottom navigation does not hide content and respects `safe-area-inset-bottom`.
- [ ] Objects / Overview / Data / Columns / SQL are reachable without overlapping controls.
- [ ] Data and SQL results use mobile record cards instead of a squeezed desktop table.
- [ ] Dialogs stay inside the viewport and remain scrollable.
- [ ] Long filenames, column names, and values do not break layout.
- [ ] Tap targets remain practical for touch use.

## Language

- [ ] Japanese initial UI and help text are complete.
- [ ] Switch to English and confirm header, overview, object browser, data, columns, SQL, comparison, dialogs, and help text update.
- [ ] Switch back to Japanese.
- [ ] Only the language preference persists across reloads; SQL/history/database state does not.

## Primary fixture

Open `test-data/browser-kitty-sample.duckdb`.

- [ ] Overview shows `main` and `analytics` objects without auto-selecting a table.
- [ ] Open `main.odd names` and search `100%_complete`; `%` and `_` behave literally.
- [ ] Open `main.customers`; test `country contains Japan`, `email is NULL`, and `email is not NULL`.
- [ ] Combine free-text search and a column filter.
- [ ] Open `main.orders`; filter `status equals paid`, sort `order_id` descending, and move pages while keeping the sort.
- [ ] Inspect STRUCT, MAP, LIST, BLOB, NULL, long text, Japanese identifiers, and unusual column names.
- [ ] Export visible rows to CSV and JSON and confirm only the current page is included.

## Column profiling

Use `analytics.profile_cases`.

- [ ] `category`: NULL rate and common values.
- [ ] `score`: min / max / average / approximate quartiles / median.
- [ ] `event_date`: min / max date.
- [ ] `all_null`: 100% NULL without a profile crash.
- [ ] BLOB / complex-value profiling fails gracefully when an aggregate is unsupported.
- [ ] Opening a database or Columns view does not automatically profile every column.

## SQL

- [ ] SELECT aggregation works.
- [ ] WITH query works.
- [ ] DESCRIBE works.
- [ ] Explain works for SELECT / WITH / VALUES.
- [ ] SQL result CSV / JSON contains only displayed rows and never more than 1,000 rows.
- [ ] Query history remains memory-only and is capped.
- [ ] `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ATTACH`, `INSTALL`, `LOAD`, `SET`, multiple statements, and other blocked forms are rejected before execution.
- [ ] The database remains usable after rejected SQL.

## Data dictionary

- [ ] Save the data dictionary before profiling columns and confirm it contains metadata but no table rows.
- [ ] Profile a column, save again, and confirm the completed profile appears.
- [ ] Confirm the report warns that common values from completed profiles can be included.
- [ ] Japanese / English switching and Print work in the generated report.
- [ ] The report works offline and its CSP uses `connect-src 'none'`.

## Database comparison

Compare the primary fixture with `test-data/browser-kitty-sample-after.duckdb`.

- [ ] Added schema `archive` appears.
- [ ] Added table `main.products` appears.
- [ ] Removed table `main.order_items` appears.
- [ ] `main.customers` column changes appear.
- [ ] `main.customer_summary` view-definition change appears.
- [ ] UI states that row data is not exhaustively compared.
- [ ] The primary database remains usable after comparison.
- [ ] Opening another primary database clears the previous comparison state.

## Fully local processing and CSP

- [ ] Open `dist/index.html` directly with `file://`.
- [ ] Load the primary fixture and use Overview, Data, Columns, SQL, data dictionary, and comparison.
- [ ] DevTools Network shows no HTTP/HTTPS/WebSocket/analytics/CDN request caused by app operation.
- [ ] Runtime CSP contains `connect-src 'none'`.
- [ ] DuckDB extension auto-install, auto-load, community extension loading, and external access are disabled where supported.
- [ ] Database files, filters, SQL, and query results are not written to `localStorage`.
- [ ] Build-time access to npm/GitHub is not confused with runtime data processing; after build, user DB operations require no external connection.

## Standalone variants

- [ ] `dist/index.html` opens and operates normally.
- [ ] `dist/index.self-extract.html` unpacks successfully in a supported Chromium browser.
- [ ] The self-extracting loader shows the same favicon and does not require a network request.
- [ ] Readable and self-extract file sizes are recorded in `dist/build-size-report.json`.

## GitHub Pages and release files

- [ ] `assets/favicon.svg` matches the app header icon.
- [ ] README / README.ja.md describe what the app can and cannot do and accurately explain build-time vs runtime networking.
- [ ] GitHub Actions build uses `scripts/prepare-release.ps1`, not an upstream/npm-only DuckDB-Wasm release build.
- [ ] GitHub Pages workflow builds successfully from a clean checkout and uses the pinned Builder Release runtime.
- [ ] Published page loads and does not introduce runtime CDN/network dependencies.
- [ ] Final tag/version/changelog all agree on `v1.0.1`.
