DuckDB Explorer v1.0.0
======================

Release build on Windows:

1. Read README.ja.md and RELEASE_CHECKLIST.md.
2. For the final release verification, run build-standalone.bat -ForceDownload.
   - validates PowerShell syntax and repository contracts
   - verifies dependencies.lock.json
   - generates both DuckDB regression fixtures
   - downloads the pinned htmlapps-duckdb-wasm-builder v0.1.2 GitHub Release artifact
   - verifies the Release ZIP SHA-256 and matched API / Worker / WASM hashes
   - builds dist/index.html and dist/index.self-extract.html
   - confirms the generated release uses the pinned Builder runtime
3. Open dist/index.html directly with file:// and complete RELEASE_CHECKLIST.md.

Important v1.0.0 boundary:
- the application is read-only
- Overview, browsing, search, filters, sorting, column profiling, SQL, data dictionary HTML, and structural DB comparison are included
- viewer export is visible-page only; SELECT-style SQL results are capped at 1,000 rows
- row-by-row DB diff, write SQL, automatic all-column profiling, and whole-table export are out of scope
- release builds use the pinned explorer-minimal matched runtime from htmlapps-duckdb-wasm-builder v0.1.2
- the runtime GitHub download is build-time only; the generated app keeps connect-src 'none'

Do not edit generated files in dist manually.
