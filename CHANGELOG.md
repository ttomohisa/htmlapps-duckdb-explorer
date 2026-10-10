# Changelog

## 1.0.4 - 2026-10-10

- Keep long cell/profile titles inside dialog bounds without displacing the Close button or hiding the body.
- Use the dynamic viewport height and contain modal scrolling so short windows remain usable and the background stays still.

## 1.0.3 - 2026-10-09

- Normalize brand icon backgrounds to #16624f with exact 25% corner radii across SVG assets, header icons, and embedded favicons, preserving existing artwork.
- Add focused brand representation regression checks.

## [1.0.2] - 2026-10-06

### Fixed

- Materialize Arrow DECIMAL values with their schema scale before display, details, copying, and relation/SQL CSV or JSON export. Preserve exact digits, negative values, trailing zeros, NULLs, and nested LIST/ARRAY/STRUCT/MAP values instead of treating decimals as binary data. JSON stores decimals as strings.
- Keep true BLOBs, BigInts, timestamp representation, special object keys, and existing toolbar/result-ownership behavior unchanged.

### Tests

- Add real pinned-Arrow regressions for fixture prices, 38-digit precision, high scales, negatives, zero/NULL, sliced buffers, nested special keys, BLOB separation, and Japanese/English relation/SQL display, details, and exports.

## [1.0.1] - 2026-10-06

### Added

- First / Last page controls with localized accessible names, exact BigInt boundary offsets, and the existing pending-search/result-ownership guards.

### Fixed

- Wrap the data toolbar, export buttons, and paging controls to prevent overlap at intermediate desktop and narrow mobile widths in Japanese and English.
- Preserve own `__proto__` data keys, including nested Arrow STRUCT/MAP values, in normalization, relation/SQL JSON exports, and full record details without changing object prototypes.
- Rewrite Japanese/English help as current-use guidance and remove the duplicate release-history section, while retaining the app version and existing limitations.
- Keep relation loading and query errors visible when changing Japanese/English, instead of restoring cached rows under another page or filter.
- Tie displayed rows and CSV/JSON exports to the current database, relation, query conditions, page, and request generation; discard stale results and errors.
- Invalidate exports immediately while search is debouncing and cancel pending search timers on relation/file changes. Empty results disable exports.

### Tests

- Add CSS-contract regressions for toolbar wrapping, narrow export groups, pager hit-target sizing, and patch-version parity in all release variants.
- Add dependency-free production-function regressions for page/search/filter/sort transitions, language changes, failures/retry, stale requests, source disposal, empty rows, export filenames and CSV serialization.
- Run the suite in repository checks, the tracked root HTML, and both generated release variants. Verify root/source parity and refresh the root alias from the verified Windows release artifact.

## [1.0.0] - 2026-09-04

### Changed

- Promoted the validated v0.8.0 feature set to the first stable release without adding a new product area.
- Replaced historical version-specific release helpers with the standard `build-standalone.bat` entry point plus generic `scripts/prepare-release.ps1` and `scripts/check-release.ps1`.
- Made the canonical release build fetch the pinned `explorer-minimal` matched runtime from the `ttomohisa/htmlapps-duckdb-wasm-builder` v0.1.2 GitHub Release.
- Added `duckdb-wasm-runtime.lock.json` to pin the Builder Release URL, archive SHA-256, manifest SHA-256, and API / Worker / WASM SHA-256 values.
- Updated GitHub Actions and GitHub Pages builds to use the same pinned Builder Release runtime as local release builds.
- Updated README, release checklist, offline verification guide, GitHub Pages guidance, and screenshots for v1.0.0.

### Removed

- Removed historical `prepare-v*.bat`, `scripts/prepare-v*.ps1`, and `scripts/check-v*.ps1` files from the release repository.
- Removed the generated v0.8.0 verification-pack directory and duplicate `assets/screenshot-ja.png`.
- Removed dedicated local-Builder wrapper scripts; development builds can still pass `-DuckDBWasmArtifactDir` directly to `build-standalone.ps1`.

### Release integrity

- Release builds reject a Builder Release archive whose SHA-256 does not match the runtime lock.
- Extracted Builder artifacts are accepted only when manifest, verification, browser smoke-test status, and matched API / Worker / WASM hashes all pass.
- The generated application keeps the existing runtime privacy boundary with `connect-src 'none'`; GitHub/npm access remains build-time only.

## [0.8.0] - 2026-09-04

### Changed

- Finished the release-facing header and landing-page alignment with the current SQLite Explorer / Browser Kitty pattern while preserving the DuckDB-specific icon and read-only workflow.
- Rewrote `README.md` and `README.ja.md` to match the current Browser Kitty repository style used by PDF Organizer: badges, live demo, screenshots, quick start, usage, GitHub Pages, build details, privacy, limitations, dependencies, and release validation.
- Added `prepare-v0.8.0.bat`, `scripts/prepare-v0.8.0.ps1`, and `scripts/check-v0.8.0.ps1` as the release-preparation path.
- Updated the verified custom DuckDB-Wasm build entry point to run the v0.8.0 preparation flow.
- Added dedicated GitHub Pages deployment guides and a release checklist covering PC/mobile, Japanese/English, `file://`, fixtures, SQL, profiles, data dictionary, comparison, CSP/network behavior, standalone variants, and custom runtime regression.
- Added current Japanese/English release screenshots under `assets/`.

### Fixed

- Normal standalone builds now remove stale custom DuckDB-Wasm manifest/verification files before writing `dist/`, preventing metadata from an earlier custom build from being mistaken for the current official build.
- Repository validation now includes the v0.8.0 release contract and rejects accidental `__pycache__` / `*.pyc` files.
- CI artifacts now include `dist/build-size-report.json` for release-size review.
- Release documentation/assets now trigger pull-request validation, and `.gitignore` explicitly excludes Python bytecode/cache files.

## [0.7.0] - 2026-09-03

### Added

- Optional build-time integration for a verified `explorer-minimal` matched DuckDB runtime artifact from `htmlapps-duckdb-wasm-builder` v0.1.2.
- Strict artifact gate for builder/profile/API compatibility, EH/single-thread requirements, SharedArrayBuffer/loadable-extension flags, browser smoke-test status, manifest hash, and API / Worker / WASM SHA-256.
- `build-with-local-duckdb.bat` and `prepare-v0.7.0.bat` support for custom artifact builds.
- Custom DuckDB-Wasm build manifest and verification records are copied into `dist/` for traceability.

### Changed

- Normal builds continue to use the official `@duckdb/duckdb-wasm` 1.32.0 WASM; custom artifacts are never auto-discovered or auto-adopted.
- Custom builds replace the browser API, EH Worker, and WASM together from one verified matched artifact; normal builds continue to use the locked official package assets.
- Custom runtime verification now requires the v1.32.0 release-compatible Emscripten 3.1.71 / `relperf` build contract and a matched API / EH Worker / WASM artifact set.
- Custom artifact verification now follows the fixture-based Builder v0.1.2 smoke-test contract (`local DuckDB fixture loaded as Blob`, `local DuckDB opened read-only`, and `read-only write protection`).
- Fixed PowerShell syntax in the v0.4.0 / v0.5.0 regression marker checks used by the v0.7.0 preparation flow.
- Fixed test-fixture SHA-256 verification to use the existing .NET-compatible hashing approach instead of `Get-FileHash`, which is unavailable in some supported Windows PowerShell environments.
- Aligned the landing page and sticky header with the current SQLite Explorer layout: compact app metadata, inline version badge, text language switcher, local-processing badge, wider drop area, and selected-file chip.
- Fixed the v0.7.0 regression checker so its UI alignment markers and CSP/legacy-WASM checks remain parse-safe in Windows PowerShell.

## [0.6.0] - 2026-09-03

### Added

- Structural comparison between the currently open DuckDB file and a second local DuckDB file.
- Schema, table, view, and column added/removed detection.
- Column type, nullability, and default-value change detection.
- View definition change detection.
- Estimated table row-count change display using DuckDB catalog metadata.
- A second deterministic comparison fixture: `browser-kitty-sample-after.duckdb`.

### Changed

- Test-data generation now produces both the base and comparison fixtures.
- The comparison database is opened in a separate read-only DuckDB-Wasm runtime and released after metadata collection.

## [0.5.0] - 2026-09-03

### Added

- Added standalone data dictionary HTML export from Database Overview.
- Report includes file/database summary, schemas, tables, views, column definitions, and view SQL definitions.
- Reuses only column profiles already analyzed in the current session; report generation does not automatically profile every column.
- Added Japanese / English switching and print-friendly styling inside the generated report.

### Privacy

- Schema reports do not include table rows.
- Common values from completed column profiles are included and are disclosed in the Overview note before export.
- Generated reports have no external runtime dependency and use `connect-src 'none'`.

## [0.4.0] - 2026-09-03

### Added

- Added a global read-only SQL workspace.
- Added guarded one-statement execution for SELECT / WITH / VALUES / SHOW / DESCRIBE / DESC / EXPLAIN.
- Added Explain for SELECT-style statements.
- Added memory-only query history (up to 20 entries, cleared on file change).
- Added generic desktop/mobile SQL result rendering with full-value inspection.
- Added CSV / JSON export for the current SQL result.

### Changed

- SELECT-style SQL results are capped at the first 1,000 rows.
- Runtime hardening now also attempts to disable DuckDB external access.
- Mobile navigation now includes SQL as a fifth view.

## [0.3.0] - 2026-09-03

### Added

- Added a lightweight database overview shown immediately after opening a file.
- Added file size, schema/table/view/column counts, DuckDB version, and an object list to the overview.
- Added on-demand column analysis from the Columns view.
- Added NULL rate, estimated distinct count, numeric summary statistics, temporal ranges, text length statistics, and common-value summaries.
- Added a dedicated mobile Overview tab.
- Added profile-focused test fixture data and regression markers.

### Changed

- Opening a database no longer auto-selects the first relation; the overview is the initial post-open screen.
- Column analysis is explicit and cached so large databases are not profiled automatically.

## [0.2.2] - 2026-09-03

### Changed

- Updated the DuckDB Explorer icon to follow the SQLite Explorer-style layout more closely.
- Added a magnifying-glass motif to the icon while keeping the `DuckDB` label visible.
- Updated both `assets/favicon.svg` and the inline header icon to the same design.

## [0.2.1] - 2026-09-03

### Fixed

- Fixed standalone `file://` startup where a Blob Worker could not `fetch()` the embedded DuckDB WASM Blob URL (`blob:null/...`).
- Transfer the embedded WASM ArrayBuffer into the Worker and serve it through an in-worker Response bridge, so no WASM Blob fetch is required.
- Set runtime `connect-src` to `none` because DuckDB startup no longer requires Blob fetching.

### Changed

- Updated the favicon and header app icon so the icon itself includes the `DuckDB` name.

## [0.2.0] - 2026-09-03

### Added

- Free-text search across the selected table or view.
- Column filters for contains, equals, not-equals, prefix, suffix, NULL, and non-NULL conditions.
- Column sorting from the data table header.
- Filtered row counts and filter-aware pagination.
- Full cell detail dialog with copy support.
- Mobile record-card data view with full-record details.
- CSV export for the currently visible page.
- JSON export for the currently visible page.
- Explicit NULL and nested-value presentation.
- Additional test-fixture coverage for search literals and BLOB values.

### Changed

- Data controls now keep search, filters, sort order, count, and pagination on the same query state.
- Search uses literal substring matching rather than SQL LIKE wildcard semantics.
- Help, README, app metadata, and release preparation scripts updated for v0.2.0.

## [0.1.0] - 2026-09-03

### Added

- Initial DuckDB Explorer implementation.
- Local `.duckdb` / `.db` file opening with DuckDB-Wasm.
- Read-only database access.
- Schema, table, and view browser.
- 100-row paginated data viewer.
- Column definition viewer.
- Desktop and mobile layouts.
- Japanese and English UI.
- Embedded dependency configuration for DuckDB-Wasm and Apache Arrow.
- Deterministic DuckDB test fixture and Windows generation scripts.
