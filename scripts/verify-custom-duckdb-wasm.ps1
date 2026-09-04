param(
  [Parameter(Mandatory = $true)][string]$ArtifactDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256FileHex([string]$Path) {
  if (-not (Test-Path $Path)) { throw "File not found for SHA-256: $Path" }
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

$resolved = [System.IO.Path]::GetFullPath($ArtifactDir)
if (-not (Test-Path $resolved -PathType Container)) { throw "DuckDB-Wasm artifact directory was not found: $resolved" }

$manifestPath = Join-Path $resolved "manifest.json"
$verificationPath = Join-Path $resolved "verification.json"
$wasmPath = Join-Path $resolved "duckdb-eh.wasm"
$workerPath = Join-Path $resolved "duckdb-browser-eh.worker.js"
$apiPath = Join-Path $resolved "duckdb-browser.cjs"
foreach ($path in @($manifestPath, $verificationPath, $wasmPath, $workerPath, $apiPath)) {
  if (-not (Test-Path $path -PathType Leaf) -or (Get-Item $path).Length -eq 0) { throw "Required DuckDB-Wasm artifact file is missing: $path" }
}

$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$verification = Get-Content -Raw -Encoding UTF8 $verificationPath | ConvertFrom-Json

if ([int]$manifest.schemaVersion -ne 2) { throw "Unsupported DuckDB-Wasm manifest schemaVersion." }
if ([string]$manifest.builder -ne "htmlapps-duckdb-wasm-builder") { throw "DuckDB-Wasm artifact was not produced by htmlapps-duckdb-wasm-builder." }
if ([string]$manifest.builderVersion -ne "0.1.2") { throw "DuckDB-Wasm artifact builderVersion must be 0.1.2 for the DuckDB Explorer release baseline." }
if ([string]$manifest.profile -ne "explorer-minimal") { throw "DuckDB Explorer accepts only the explorer-minimal DuckDB-Wasm profile." }
if ([string]$manifest.duckdbWasm.npmApiVersion -ne "1.32.0") { throw "Custom DuckDB-Wasm must match @duckdb/duckdb-wasm API version 1.32.0." }
if ([string]$manifest.duckdbWasm.ref -ne "v1.32.0") { throw "Custom DuckDB-Wasm ref must be v1.32.0 for the DuckDB Explorer release baseline." }
if ([string]$manifest.duckdbWasm.commit -ne "a20b8290e79e37a7b914e62621aa412d69ba95fc") { throw "Custom DuckDB-Wasm commit does not match the validated release baseline." }
if ([string]$manifest.duckdb.commit -ne "d1dc88f950d456d72493df452dabdcd13aa413dd") { throw "Custom DuckDB commit does not match the validated release baseline." }
if ([string]$manifest.emscripten.version -ne "3.1.71") { throw "Custom DuckDB-Wasm must use Emscripten 3.1.71." }
if ([string]$manifest.emscripten.commit -ne "35632d66a678851091855f87261b9cb651e81c72") { throw "Custom DuckDB-Wasm Emscripten commit does not match the v1.32.0 EH release toolchain." }
if ([string]$manifest.target.optimizationProfile -ne "relperf") { throw "Custom DuckDB-Wasm must use the upstream relperf optimization profile." }
if ([string]$manifest.target.runtimeAssetMode -ne "matched-build") { throw "Custom DuckDB-Wasm must include API, EH Worker, and WASM generated as one matched build." }
if ([string]$manifest.target.bundle -ne "eh") { throw "Custom DuckDB-Wasm must use the EH bundle." }
if (-not [bool]$manifest.target.wasmExceptions) { throw "Custom DuckDB-Wasm must keep WASM exceptions enabled." }
if ([bool]$manifest.target.threads) { throw "Custom DuckDB-Wasm must remain single-threaded." }
if ([bool]$manifest.target.sharedArrayBufferRequired) { throw "Custom DuckDB-Wasm must not require SharedArrayBuffer." }
if ([bool]$manifest.target.loadableExtensions) { throw "Custom DuckDB-Wasm must keep loadable extensions disabled." }
if (-not [bool]$manifest.target.explorerMinimal) { throw "Custom DuckDB-Wasm must identify the Explorer minimal profile." }
if ([bool]$manifest.target.parquetStaticWebBridge) { throw "Explorer minimal artifact must not include the Parquet static Web bridge." }
if ([bool]$manifest.target.jsonStaticWebBridge) { throw "Explorer minimal artifact must not include the JSON static Web bridge." }

if ([int]$verification.schemaVersion -ne 2) { throw "Unsupported DuckDB-Wasm verification schemaVersion." }
if ([string]$verification.status -ne "passed") { throw "DuckDB-Wasm browser verification did not pass." }
if ([string]$verification.profile -ne [string]$manifest.profile) { throw "DuckDB-Wasm verification profile does not match manifest." }
if ([string]$verification.builderVersion -ne [string]$manifest.builderVersion) { throw "DuckDB-Wasm verification builderVersion does not match manifest." }
if ([string]$verification.browserSmokeTest.status -ne "passed") { throw "DuckDB-Wasm browser smoke test did not pass." }

$requiredSmokeTests = @(
  "browser API loaded",
  "local DuckDB fixture loaded as Blob",
  "local DuckDB opened read-only",
  "local-only settings",
  "version query",
  "duckdb_tables()",
  "duckdb_views()",
  "information_schema.columns",
  "nested values",
  "column profile aggregates",
  "EXPLAIN",
  "read-only write protection"
)
$smokeByName = @{}
foreach ($test in @($verification.browserSmokeTest.tests)) {
  $smokeByName[[string]$test.name] = [string]$test.status
}
foreach ($name in $requiredSmokeTests) {
  if (-not $smokeByName.ContainsKey($name) -or [string]$smokeByName[$name] -ne "passed") {
    $observedSmokeTests = (@($verification.browserSmokeTest.tests) | ForEach-Object {
      "$([string]$_.name)=$([string]$_.status)"
    }) -join "; "
    throw "DuckDB-Wasm browser smoke test is missing a passed Explorer compatibility check: $name. Observed: $observedSmokeTests"
  }
}

$runtimeFiles = [ordered]@{
  wasm = [ordered]@{ Path = $wasmPath; Manifest = $manifest.files.wasm; VerificationKey = "wasm" }
  worker = [ordered]@{ Path = $workerPath; Manifest = $manifest.files.worker; VerificationKey = "worker" }
  api = [ordered]@{ Path = $apiPath; Manifest = $manifest.files.api; VerificationKey = "api" }
}
foreach ($entry in $runtimeFiles.GetEnumerator()) {
  $key = [string]$entry.Key
  $record = $entry.Value
  $manifestRecord = $record["Manifest"]
  $actual = Get-Sha256FileHex ([string]$record["Path"])
  $manifestSha = ([string]$manifestRecord.sha256).ToLowerInvariant()
  $verificationProperty = $verification.runtimeAssetSha256.PSObject.Properties[$key]
  $expectedProperty = $verification.expectedRuntimeAssetSha256.PSObject.Properties[$key]
  if ($null -eq $verificationProperty -or $null -eq $expectedProperty) {
    throw "DuckDB-Wasm verification is missing matched runtime hash: $key"
  }
  $verificationSha = ([string]$verificationProperty.Value).ToLowerInvariant()
  $expectedSha = ([string]$expectedProperty.Value).ToLowerInvariant()
  if ($actual -ne $manifestSha -or $actual -ne $verificationSha -or $actual -ne $expectedSha) {
    throw "DuckDB-Wasm matched runtime SHA-256 mismatch for '$key'. Refusing to embed an unverified artifact."
  }
}

$actualManifestSha = Get-Sha256FileHex $manifestPath
if ($actualManifestSha -ne ([string]$verification.manifestSha256).ToLowerInvariant()) {
  throw "DuckDB-Wasm manifest SHA-256 does not match verification.json."
}

Write-Host "[OK] Verified matched DuckDB-Wasm runtime artifact: $resolved" -ForegroundColor Green
Write-Host "[OK] Profile: $([string]$manifest.profile), API/Worker/WASM hashes verified."
