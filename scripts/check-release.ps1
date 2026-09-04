param(
  [switch]$RequireBuiltOutput
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$SourcePath = Join-Path $Root "src\index.template.html"
$FixturePath = Join-Path $Root "test-data\browser-kitty-sample.sql"
$CompareFixturePath = Join-Path $Root "test-data\browser-kitty-sample-after.sql"
$ConfigPath = Join-Path $Root "app.config.json"
$RuntimeLockPath = Join-Path $Root "duckdb-wasm-runtime.lock.json"

function Get-Sha256FileHex([string]$Path) {
  if (-not (Test-Path $Path -PathType Leaf)) { throw "File not found for SHA-256: $Path" }
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
    return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

$source = Get-Content -Raw -Encoding UTF8 $SourcePath
$fixture = Get-Content -Raw -Encoding UTF8 $FixturePath
$compareFixture = Get-Content -Raw -Encoding UTF8 $CompareFixturePath
$config = Get-Content -Raw -Encoding UTF8 $ConfigPath | ConvertFrom-Json
$runtimeLock = Get-Content -Raw -Encoding UTF8 $RuntimeLockPath | ConvertFrom-Json

if ([string]$config.version -ne "1.0.0") { throw "app.config.json version must be 1.0.0." }

$requiredSourceTokens = @(
  "v1.0.0",
  "DuckDBAccessMode.READ_ONLY",
  "SET autoinstall_known_extensions=false",
  "SET autoload_known_extensions=false",
  "SET allow_community_extensions=false",
  "SET enable_external_access=false",
  "browser-kitty-wasm://embedded",
  "__browserKittyDuckDBWasm",
  "validateReadOnlySql",
  "saveSchemaReport",
  "loadComparisonSnapshot",
  "compareSnapshots",
  "showComparison",
  "startComparison",
  "compareFileInput",
  "comparisonView",
  "compareDatabaseBtn",
  "compareStructureOnly",
  "estimated_size FROM duckdb_tables()",
  "information_schema.columns",
  "duckdb_views() WHERE NOT internal",
  'class="app-header"',
  'class="header-inner"',
  'class="version-badge"',
  'class="brand-meta"',
  'id="headerFile"',
  'class="language-button"',
  'class="local-badge"',
  'data-i18n="heroTitle"',
  "mobile-nav",
  "safe-area-inset-bottom"
)
foreach ($token in $requiredSourceTokens) {
  if (-not $source.Contains($token)) { throw "src\index.template.html is missing release marker: $token" }
}

$legacyBlobMarker = 'blobUrlAsync(' + [char]39 + 'duckdb-wasm' + [char]39 + ',' + [char]39 + 'wasm' + [char]39 + ')'
if ($source.Contains($legacyBlobMarker)) { throw "Standalone file mode must not expose DuckDB WASM through a Blob URL." }
$cspNonePattern = 'connect-src\s+\x27none\x27'
if ($source -notmatch $cspNonePattern) { throw "Runtime CSP must use connect-src none." }
if ($source -match 'connect-src[^;]*(?:https?:|wss?:|\*)') { throw "Runtime CSP must not allow external network schemes." }
if ($source -match 'localStorage[^\n]*(?:sqlHistory|sqlEditor|sqlLastRows|comparison)') { throw "SQL/comparison state must not be persisted to localStorage." }
if ($source -match 'await\s+selectObject\(state\.objects\[0\]\)') { throw "Database open must keep Overview as the initial content view." }

$comparisonMatch = [regex]::Match($source, 'async function loadComparisonSnapshot\(file\)[\s\S]*?function normalizeViewSql')
if (-not $comparisonMatch.Success) { throw "Comparison metadata loader block could not be located." }
$comparisonLoader = $comparisonMatch.Value
if ($comparisonLoader -match '(?i)SELECT\s+\*\s+FROM') { throw "Database comparison must not read table row data." }
if ($comparisonLoader -notmatch 'DuckDBAccessMode\.READ_ONLY') { throw "Comparison database must be opened read-only." }
if ($comparisonLoader -notmatch 'hardenConnection\(conn\)') { throw "Comparison database must apply local-only DuckDB settings." }

if ([int]$runtimeLock.schemaVersion -ne 1) { throw "duckdb-wasm-runtime.lock.json schemaVersion must be 1." }
if ([string]$runtimeLock.builderRepository -ne "ttomohisa/htmlapps-duckdb-wasm-builder") { throw "Runtime lock must pin ttomohisa/htmlapps-duckdb-wasm-builder." }
if ([string]$runtimeLock.builderVersion -ne "0.1.2" -or [string]$runtimeLock.tag -ne "v0.1.2") { throw "Runtime lock must pin Builder v0.1.2." }
if ([string]$runtimeLock.profile -ne "explorer-minimal") { throw "Runtime lock must pin explorer-minimal." }
if ([string]$runtimeLock.assetName -ne "duckdb-wasm-explorer-minimal-v0.1.2.zip") { throw "Runtime lock has an unexpected Release asset name." }
if ([string]$runtimeLock.downloadUrl -ne "https://github.com/ttomohisa/htmlapps-duckdb-wasm-builder/releases/download/v0.1.2/duckdb-wasm-explorer-minimal-v0.1.2.zip") { throw "Runtime lock has an unexpected Release URL." }
foreach ($hash in @(
  [string]$runtimeLock.archiveSha256,
  [string]$runtimeLock.manifestSha256,
  [string]$runtimeLock.runtimeAssetSha256.api,
  [string]$runtimeLock.runtimeAssetSha256.worker,
  [string]$runtimeLock.runtimeAssetSha256.wasm
)) {
  if ($hash -notmatch '^[a-f0-9]{64}$') { throw "Runtime lock contains an invalid SHA-256 value." }
}
if ([string]$runtimeLock.archiveSha256 -ne "d6a04fb3acca409de2343e0139a221b6b4d76734f4cfc5afe1b6dfa507b4e480") { throw "Runtime lock archive SHA-256 does not match the Builder v0.1.2 GitHub Release." }
if ([string]$runtimeLock.manifestSha256 -ne "57503be4095621002817143180dcc314dc90537600b8b82ea40138fd6783d3e9") { throw "Runtime lock manifest SHA-256 does not match the validated Explorer runtime." }
if ([string]$runtimeLock.runtimeAssetSha256.api -ne "a0685dfb4c55abaa0d49f2dba827d7c714bf2b007159373b4a50349b097209d2") { throw "Runtime lock API SHA-256 does not match the validated Explorer runtime." }
if ([string]$runtimeLock.runtimeAssetSha256.worker -ne "c2ef3ddd2d8037e166ca69ade3767dea4bff171a9ab692ae18b961977d56e0a3") { throw "Runtime lock Worker SHA-256 does not match the validated Explorer runtime." }
if ([string]$runtimeLock.runtimeAssetSha256.wasm -ne "a84a1b6a94a9369975ceaecdabfc0a701dcf5dba733ad249d249a30d4b99c29e") { throw "Runtime lock WASM SHA-256 does not match the validated Explorer runtime." }

$fetchScript = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "scripts\fetch-duckdb-wasm-runtime.ps1")
foreach ($token in @(
  "Invoke-WebRequest",
  "duckdb-wasm-runtime.lock.json",
  "archiveSha256",
  "Expand-Archive",
  "verify-custom-duckdb-wasm.ps1",
  "Downloaded DuckDB-Wasm Release archive SHA-256 mismatch"
)) {
  if (-not $fetchScript.Contains($token)) { throw "Pinned runtime fetcher is missing required gate marker: $token" }
}

$buildBat = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "build-standalone.bat")
if (-not $buildBat.Contains("scripts\prepare-release.ps1")) { throw "build-standalone.bat must use the pinned release preparation flow." }

$customVerifier = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "scripts\verify-custom-duckdb-wasm.ps1")
foreach ($token in @(
  "htmlapps-duckdb-wasm-builder",
  "explorer-minimal",
  "builderVersion must be 0.1.2",
  "API version 1.32.0",
  "matched-build",
  "runtimeAssetSha256",
  "browser smoke test did not pass",
  "local DuckDB fixture loaded as Blob",
  "local DuckDB opened read-only",
  "read-only write protection",
  "SHA-256 mismatch"
)) {
  if (-not $customVerifier.Contains($token)) { throw "Custom DuckDB-Wasm verifier is missing gate marker: $token" }
}

if (-not $fixture.StartsWith("-- DuckDB Explorer v1.0.0") -or -not $compareFixture.StartsWith("-- DuckDB Explorer v1.0.0")) { throw "Regression fixture source comments must identify DuckDB Explorer v1.0.0." }
$requiredFixtureTokens = @("100%_complete", "binary_samples", "profile_cases", "CREATE VIEW", "STRUCT", "MAP")
foreach ($token in $requiredFixtureTokens) {
  if (-not $fixture.Contains($token)) { throw "Base fixture is missing regression marker: $token" }
}
$requiredCompareFixtureTokens = @(
  "CREATE SCHEMA archive",
  "vip BOOLEAN DEFAULT false",
  "lifetime_value DOUBLE",
  "total DECIMAL(14,2)",
  "CREATE TABLE main.products",
  "CREATE TABLE archive.closed_orders",
  "CREATE VIEW archive.customer_directory"
)
foreach ($token in $requiredCompareFixtureTokens) {
  if (-not $compareFixture.Contains($token)) { throw "Comparison fixture is missing regression marker: $token" }
}

$requiredReleaseFiles = @(
  "README.md",
  "README.ja.md",
  "README-FIRST.txt",
  "CHANGELOG.md",
  "RELEASE_CHECKLIST.md",
  "VERIFY_OFFLINE.md",
  "docs\GITHUB_PAGES.md",
  "docs\GITHUB_PAGES.ja.md",
  "assets\favicon.svg",
  "assets\screenshot.png",
  "assets\screenshot-en.png",
  "build-standalone.bat",
  "scripts\prepare-release.ps1",
  "scripts\fetch-duckdb-wasm-runtime.ps1",
  "duckdb-wasm-runtime.lock.json"
)
foreach ($relative in $requiredReleaseFiles) {
  if (-not (Test-Path (Join-Path $Root $relative) -PathType Leaf)) { throw "Release file is missing: $relative" }
}

$staleRootScripts = @(Get-ChildItem -Path $Root -File -Filter "prepare-v*.bat" -ErrorAction SilentlyContinue)
$stalePrepareScripts = @(Get-ChildItem -Path (Join-Path $Root "scripts") -File -Filter "prepare-v*.ps1" -ErrorAction SilentlyContinue)
$staleCheckScripts = @(Get-ChildItem -Path (Join-Path $Root "scripts") -File -Filter "check-v*.ps1" -ErrorAction SilentlyContinue)
if ($staleRootScripts.Count -gt 0 -or $stalePrepareScripts.Count -gt 0 -or $staleCheckScripts.Count -gt 0) {
  throw "Historical version-specific prepare/check scripts must not remain in the v1.0.0 repository."
}
$verificationPackDirs = @(Get-ChildItem -Path $Root -Directory -Filter "DuckDB-Explorer-v*-VERIFY" -ErrorAction SilentlyContinue)
if ($verificationPackDirs.Count -gt 0) { throw "Generated verification-pack directories must not be included in the release repository." }
if (Test-Path (Join-Path $Root "assets\screenshot-ja.png")) { throw "Duplicate screenshot-ja.png must not be kept; screenshot.png is the Japanese screenshot." }

$readme = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "README.md")
foreach ($token in @("build-standalone.bat", "htmlapps-duckdb-wasm-builder", "v0.1.2", "duckdb-wasm-runtime.lock.json", "GitHub Pages", "Single HTML", "Privacy", "Limitations")) {
  if (-not $readme.Contains($token)) { throw "README.md is missing release marker: $token" }
}
$readmeJa = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "README.ja.md")
foreach ($token in @("build-standalone.bat", "htmlapps-duckdb-wasm-builder", "v0.1.2", "duckdb-wasm-runtime.lock.json", "GitHub Pages", "connect-src 'none'")) {
  if (-not $readmeJa.Contains($token)) { throw "README.ja.md is missing release marker: $token" }
}

foreach ($workflowRelative in @(".github\workflows\build-standalone.yml", ".github\workflows\deploy-pages.yml")) {
  $workflowText = Get-Content -Raw -Encoding UTF8 (Join-Path $Root $workflowRelative)
  if (-not $workflowText.Contains("prepare-release.ps1")) { throw "$workflowRelative must build through prepare-release.ps1." }
  if ($workflowText -match 'prepare-v[0-9]') { throw "$workflowRelative still references historical version-specific release tooling." }
}

$forbiddenRepositoryFiles = Get-ChildItem -Path $Root -Recurse -File | Where-Object {
  $_.Name -like "*.pyc" -or $_.FullName -match '[\\/]__pycache__[\\/]'
}
if (@($forbiddenRepositoryFiles).Count -gt 0) { throw "Repository must not contain __pycache__ or *.pyc files." }

if ($RequireBuiltOutput) {
  $distRoot = Join-Path $Root "dist"
  $requiredDistFiles = @(
    "index.html",
    "index.self-extract.html",
    "dependency-manifest.json",
    "build-size-report.json",
    "self-extract-manifest.json",
    "duckdb-wasm-build-manifest.json",
    "duckdb-wasm-verification.json",
    ".nojekyll"
  )
  foreach ($name in $requiredDistFiles) {
    if (-not (Test-Path (Join-Path $distRoot $name) -PathType Leaf)) { throw "Release build output is missing: dist\\$name" }
  }

  $dependencyManifest = Get-Content -Raw -Encoding UTF8 (Join-Path $distRoot "dependency-manifest.json") | ConvertFrom-Json
  if ([string]$dependencyManifest.app.version -ne "1.0.0") { throw "dist/dependency-manifest.json app.version must be 1.0.0." }
  if ($null -eq $dependencyManifest.duckdbWasmOverride) { throw "Release build must contain duckdbWasmOverride metadata." }
  if ([string]$dependencyManifest.duckdbWasmOverride.builderVersion -ne [string]$runtimeLock.builderVersion) { throw "Release build uses the wrong Builder version." }
  if ([string]$dependencyManifest.duckdbWasmOverride.profile -ne [string]$runtimeLock.profile) { throw "Release build uses the wrong Builder profile." }
  if ([string]$dependencyManifest.duckdbWasmOverride.apiSha256 -ne [string]$runtimeLock.runtimeAssetSha256.api) { throw "Release build API SHA-256 does not match runtime lock." }
  if ([string]$dependencyManifest.duckdbWasmOverride.workerSha256 -ne [string]$runtimeLock.runtimeAssetSha256.worker) { throw "Release build Worker SHA-256 does not match runtime lock." }
  if ([string]$dependencyManifest.duckdbWasmOverride.wasmSha256 -ne [string]$runtimeLock.runtimeAssetSha256.wasm) { throw "Release build WASM SHA-256 does not match runtime lock." }
  if ([string]$dependencyManifest.duckdbWasmOverride.manifestSha256 -ne [string]$runtimeLock.manifestSha256) { throw "Release build manifest SHA-256 does not match runtime lock." }
  if ([string]$dependencyManifest.duckdbWasmOverride.browserSmokeTest -ne "passed") { throw "Release build must use a runtime with a passed browser smoke test." }

  $buildManifestPath = Join-Path $distRoot "duckdb-wasm-build-manifest.json"
  if ((Get-Sha256FileHex $buildManifestPath) -ne ([string]$runtimeLock.manifestSha256).ToLowerInvariant()) { throw "dist DuckDB-Wasm manifest does not match runtime lock." }
  $verification = Get-Content -Raw -Encoding UTF8 (Join-Path $distRoot "duckdb-wasm-verification.json") | ConvertFrom-Json
  if ([string]$verification.status -ne "passed" -or [string]$verification.browserSmokeTest.status -ne "passed") { throw "dist DuckDB-Wasm verification must report passed browser smoke tests." }

  $builtHtml = Get-Content -Raw -Encoding UTF8 (Join-Path $distRoot "index.html")
  if (-not $builtHtml.Contains('"version":"1.0.0"')) { throw "dist/index.html does not contain app version 1.0.0." }
  if (-not $builtHtml.Contains("v1.0.0")) { throw "dist/index.html does not show v1.0.0." }
  if ($builtHtml -notmatch $cspNonePattern) { throw "dist/index.html must keep connect-src none." }
  if ($builtHtml -match 'connect-src[^;]*(?:https?:|wss?:|\*)') { throw "dist/index.html CSP must not allow external network schemes." }

  & (Join-Path $Root "scripts\verify-standalone.ps1") -Path (Join-Path $distRoot "index.html") -RequireNetworkBlock $true
  & (Join-Path $Root "scripts\verify-self-extract.ps1") -Path (Join-Path $distRoot "index.self-extract.html") -ExpectedSourcePath (Join-Path $distRoot "index.html")
}

Write-Host "[OK] DuckDB Explorer v1.0.0 release checks passed." -ForegroundColor Green
