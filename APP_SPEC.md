# DuckDB Explorer — App Specification

## Version

v1.0.0

## Goal

Open a local DuckDB database file and quickly understand its structure and contents without installing a database client, creating an account, or uploading the file.

DuckDB Explorer is a file inspector first. It is not intended to become a full database IDE in this phase.

## Product boundary for v1.0.0

v1.0.0 is the first stable release baseline. It does not add a new product area beyond the validated pre-release feature set; it formalizes the release build, documentation, GitHub Pages deployment, screenshots, and generated-artifact hygiene.

### Included

- `.duckdb` / `.db` file selection and drag & drop
- verified `explorer-minimal` DuckDB-Wasm runtime embedded at release build time
- browser API, EH Worker, and WASM are downloaded together from the pinned `htmlapps-duckdb-wasm-builder` v0.1.2 GitHub Release artifact and verified before embedding
- database opened read-only
- lightweight database overview before relation selection
- schema grouping
- tables and views
- exact row count for the selected relation
- row viewer with 100-row pagination and First / Previous / Next / Last controls
- free-text search across the selected relation
- column filters:
  - contains
  - equals
  - does not equal
  - starts with
  - ends with
  - is NULL
  - is not NULL
- column sorting by clicking a header
- filtered row count and pagination using the same query conditions
- column name, data type, nullability, and default value
- on-demand analysis for a selected column:
  - total / non-NULL / NULL count and NULL rate
  - estimated distinct count with `approx_count_distinct`
  - numeric min / max / average / approximate median and quartiles
  - temporal min / max
  - text length statistics
  - common values for text, categorical, temporal, and low-cardinality numeric columns
- nested value rendering for LIST / STRUCT / MAP and similar Arrow values
- full cell detail dialog
- full mobile record detail dialog
- visible-page CSV export
- visible-page JSON export
- standalone schema/data-dictionary HTML report
  - lightweight DB/file summary
  - schemas, tables, views, column definitions
  - view SQL definitions from `duckdb_views()`
  - only column profiles already computed in the current session
  - no table row export
  - Japanese / English switch and print CSS
- guarded read-only SQL workspace
  - one statement at a time
  - SELECT / WITH / VALUES / SHOW / DESCRIBE / DESC / EXPLAIN
  - Explain action for SELECT / WITH / VALUES
  - memory-only query history, maximum 20 entries
  - SQL result display capped at 1,000 rows
  - CSV / JSON export of the current SQL result
- structural comparison against a second local DuckDB file
  - schema/table/view added and removed
  - object type and view-definition changes
  - column added/removed/type/nullability/default changes
  - estimated table row-count changes from catalog metadata
  - no exhaustive row-data diff
- file size/name display
- Japanese / English UI
- desktop table layout
- mobile record-card layout
- user-facing loading and failure states

### Not included

- write SQL / DDL / database-changing SQL
- unrestricted arbitrary SQL
- automatic profiling of every column
- whole-table export
- Parquet export
- charts
- automatic adoption of an unverified custom DuckDB-Wasm binary

## Runtime/privacy contract

- The selected database file is registered with DuckDB-Wasm through the browser File API.
- The database is opened with `DuckDBAccessMode.READ_ONLY`.
- The application never uploads the selected database.
- Runtime HTTP/HTTPS/WebSocket access is not required or allowed.
- `blob:` is used for the embedded Worker and embedded script loading. DuckDB WASM bytes are transferred into the Worker and are not fetched through a Blob URL.
- No analytics or telemetry.
- No database contents, search text, filters, SQL text/history, or query results are persisted in localStorage.
- Only the UI language preference is persisted.
- Release builds fetch the pinned `htmlapps-duckdb-wasm-builder` v0.1.2 `explorer-minimal` Release archive during the build step.
- The Release archive SHA-256 is pinned in `duckdb-wasm-runtime.lock.json`. After extraction, `manifest.json`, `verification.json`, browser-smoke status, profile/API compatibility, manifest hash, and the API / Worker / WASM SHA-256 values are rechecked.
- This build-time download does not change the runtime privacy contract: the generated app still uses `connect-src 'none'` and performs no runtime external network access.

## Main flow

1. User opens or drops a `.duckdb` / `.db` file.
2. The embedded DuckDB-Wasm runtime starts.
3. The file is registered and opened read-only.
4. Catalog metadata is read from `duckdb_tables()` / `duckdb_views()` and a lightweight database overview is shown.
5. No exact count is run across every table during database open.
6. User selects a table or view from the overview or object tree.
7. The selected relation's columns, exact row count, and first 100 rows are shown.
8. User can search, add filters, sort columns, change pages, inspect full values, or switch to column definitions.
9. From Columns, user can explicitly analyze one column at a time.
10. User can export only the currently visible page to CSV or JSON.
11. User can open SQL from the global navigation and run one guarded read-only statement.
12. SELECT-style SQL results are capped at 1,000 displayed rows; Explain output and metadata statements are shown directly.
13. SQL history remains in memory only until another database file is opened.
14. From Overview, the user can save a standalone data dictionary HTML report.
15. Report generation reads metadata only and reuses column profiles already present in memory; it does not automatically profile all columns or export table rows.
16. From Overview, the user can select a second DuckDB file for structural metadata comparison; the comparison runtime is read-only and released after metadata collection.
17. The pinned Builder Release runtime is a build-time concern and is not exposed as an end-user setting.

## Search and filtering rules

- Free-text search converts each selected-relation column to `VARCHAR`, lowercases it, and checks for a literal substring with DuckDB `contains()`.
- Search terms are inserted as escaped SQL literals; `%` and `_` are treated as ordinary characters rather than wildcard syntax.
- Filters are built only from column names read from `information_schema.columns`.
- Column identifiers are always quoted.
- User-entered filter values are always escaped as SQL string literals.
- Search and filters are ANDed together; the free-text search itself matches if any column contains the term.
- Sorting is applied after filtering and before pagination.
- Filtered count and page rows use the same WHERE clause.

### Relation result ownership

- Relation data has explicit `idle`, `loading`, `ready`, and `error` phases.
- Starting a page, search/filter count, sort, or relation request clears cached rows and export readiness.
- A result belongs to its database connection/file, relation, page/page size, search, filters, sort, and request generation. Results and errors from older requests cannot replace the current state.
- First / Previous and Next / Last are disabled at their corresponding boundaries; all four controls are blocked during pending search/loading. Boundary navigation uses exact BigInt offsets, including a partial last page.
- Editing a debounced search immediately blocks stale exports and paging; switching relations or files cancels the pending search timer.
- Japanese/English changes re-render the current phase. They must not restore a previous page or hide the current error.
- CSV/JSON export and cell/record details require a successful current result. Empty successful results show no rows and disable exports.
- A new request can recover from an error; selecting the relation again reloads its metadata and first page.

## SQL safety rules

- SQL is checked client-side before being passed to DuckDB.
- Exactly one statement is allowed. A single trailing semicolon is accepted.
- Allowed leading statement types: `SELECT`, `WITH`, `VALUES`, `SHOW`, `DESCRIBE`, `DESC`, `EXPLAIN`.
- Tokens for writes, DDL, attachment/extension loading, environment changes, transactions, and dynamic query execution are rejected outside quoted strings/comments/quoted identifiers.
- The source database remains opened with `DuckDBAccessMode.READ_ONLY`.
- DuckDB extension auto-install / auto-load, community extensions, and external access are disabled when the runtime supports those settings.
- Runtime CSP remains `connect-src 'none'`.

## Export rules

v1.0.0 exports the currently visible page only. This is intentional so a viewer action cannot unexpectedly materialize a very large relation in browser memory.

CSV:

- includes a header row
- uses UTF-8 BOM for spreadsheet compatibility
- nested values are serialized as JSON text in a cell
- NULL becomes an empty CSV field

JSON:

- exports an array of objects
- BigInt values are converted to decimal strings
- Date values are converted to ISO strings
- nested values are recursively normalized
- column names and nested object/Map keys such as `__proto__`, `constructor`, and `toString` remain own data properties in relation/SQL JSON exports and full record details; Arrow STRUCT/MAP entries are read before lossy `toJSON()` conversion and object prototypes are unchanged

Viewer exports include the source database name, schema, relation, and page number. SQL exports use the source database name plus `sql-result` and contain only the displayed SQL result (maximum 1,000 rows).

Schema report HTML:

- contains file/DB summary, object metadata, column metadata, and view definitions
- reuses only column profiles already computed in this session
- does not trigger automatic profiling across all columns
- does not include table rows
- may include common values from completed column profiles
- contains no external runtime dependencies and uses its own `connect-src 'none'` CSP
- supports Japanese / English switching and printing

## Pinned DuckDB-Wasm release build path

- `build-standalone.bat` is the canonical release entry point.
- `scripts/fetch-duckdb-wasm-runtime.ps1` downloads `duckdb-wasm-explorer-minimal-v0.1.2.zip` from the pinned `ttomohisa/htmlapps-duckdb-wasm-builder` v0.1.2 GitHub Release unless the exact archive is already cached.
- `duckdb-wasm-runtime.lock.json` pins the Release URL, archive SHA-256, Builder version/profile, and the expected API / Worker / WASM and manifest SHA-256 values.
- The artifact must target the official 1.32.0 browser API, EH, single-thread execution, no SharedArrayBuffer requirement, and no loadable extensions.
- `verification.json` must report a passed Chromium smoke test.
- The actual browser API, EH Worker, and WASM SHA-256 values must match both manifest/verification records and the Explorer runtime lock; the manifest itself is hash-checked.
- The release build replaces the browser API, EH Worker, and WASM together; mixing files from different builds is rejected.
- The Builder manifest and verification record are copied into `dist/` for traceability.
- `build-standalone.ps1` still supports an explicit `-DuckDBWasmArtifactDir` for development, but GitHub Actions and GitHub Pages use the pinned Release path through `prepare-release.ps1`.

## Performance decisions

- Do not calculate exact counts for every table during database open. The overview uses catalog metadata only.
- Calculate count only for the selected relation.
- Fetch 100 rows per page.
- Search/filter count queries run only after the condition changes.
- Debounce free-text search by 350 ms.
- Register the browser File handle rather than eagerly copying the whole database into JS memory.
- Reuse one DuckDB connection until another file is opened.
- Cancel stale UI results with a request-generation token when the user switches objects or changes conditions quickly.
- Column analysis runs only after explicit user action and is cached per opened database/relation/column.
- Whole-table export remains out of scope to avoid unexpectedly large browser allocations.
- SQL SELECT / WITH / VALUES results are wrapped in an outer 1,001-row limit and only the first 1,000 rows are retained for display/export.
- SQL history is capped at 20 entries and is never persisted.

## Error states

The app must distinguish:

- runtime preparation
- database opening
- catalog reading
- relation data loading
- database overview metadata fallback
- column analysis loading/failure
- search/filter query failure
- unsupported/corrupt database failure
- SQL validation failure
- SQL execution failure

Technical details stay in a collapsible `Details` section.

## Mobile behavior

The mobile UI uses a bottom navigation with:

- Objects
- Overview
- Data
- Columns
- SQL

Only one primary pane is shown at a time.

The Data pane does not render the wide desktop table. It renders record cards instead:

- first five fields are shown on each card
- long values remain truncated inside the card
- `Record details` opens all fields as formatted JSON
- search/filter/export controls wrap without page-level horizontal scrolling

## Test fixture

`test-data/browser-kitty-sample.sql` generates a deterministic database covering:

- pagination
- multiple schemas
- tables/views
- empty tables
- NULL
- date/time/numeric/boolean data
- LIST/STRUCT/MAP values
- unusual identifiers
- Japanese text
- long cell values
- literal `%` and `_` characters for search regression
- binary/BLOB data for cell detail regression
- low-cardinality, numeric, date, nullable, and all-NULL columns for column-analysis regression

## Runtime hardening

The DuckDB session attempts to disable `autoinstall_known_extensions`, `autoload_known_extensions`, and community extension loading. CSP remains the final network boundary.


## Database comparison

v1.0.0 compares the currently open database against a second local DuckDB file. The comparison is metadata-oriented and read-only.

Included differences:

- schema added / removed
- table / view added / removed
- table ↔ view type changes
- view SQL definition changes
- column added / removed
- column type changes
- nullable changes
- default-value changes
- table estimated row-count changes from DuckDB catalog metadata

Excluded from v1.0.0:

- full row-by-row comparison
- primary-key aware record diff
- value-level change export
- automatic writes or migrations

The secondary database is opened in a separate DuckDB-Wasm runtime using `DuckDBAccessMode.READ_ONLY`, local-only settings are applied, metadata is read, and the temporary runtime is terminated. Comparison state is memory-only.
