param(
  [switch]$ForceDownload
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$LockPath = Join-Path $Root "duckdb-wasm-runtime.lock.json"
$VerifierPath = Join-Path $PSScriptRoot "verify-custom-duckdb-wasm.ps1"

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

if (-not (Test-Path $LockPath -PathType Leaf)) { throw "DuckDB-Wasm runtime lock is missing: $LockPath" }
$lock = Get-Content -Raw -Encoding UTF8 $LockPath | ConvertFrom-Json
if ([int]$lock.schemaVersion -ne 1) { throw "Unsupported duckdb-wasm-runtime.lock.json schemaVersion." }
if ([string]$lock.builderRepository -ne "ttomohisa/htmlapps-duckdb-wasm-builder") { throw "Unexpected DuckDB-Wasm Builder repository in runtime lock." }
if ([string]$lock.builderVersion -ne "0.1.2") { throw "DuckDB-Wasm Builder version must remain pinned to 0.1.2 for this release." }
if ([string]$lock.tag -ne "v0.1.2") { throw "DuckDB-Wasm Builder tag must remain pinned to v0.1.2 for this release." }
if ([string]$lock.profile -ne "explorer-minimal") { throw "DuckDB-Wasm runtime profile must be explorer-minimal." }
if ([string]$lock.assetName -ne "duckdb-wasm-explorer-minimal-v0.1.2.zip") { throw "Unexpected DuckDB-Wasm Release asset name." }
if ([string]$lock.downloadUrl -ne "https://github.com/ttomohisa/htmlapps-duckdb-wasm-builder/releases/download/v0.1.2/duckdb-wasm-explorer-minimal-v0.1.2.zip") {
  throw "DuckDB-Wasm Release URL is not the pinned v0.1.2 artifact."
}
if ([string]$lock.archiveSha256 -notmatch '^[a-f0-9]{64}$') { throw "Runtime archive SHA-256 is invalid." }
if ([string]$lock.archiveSha256 -ne "d6a04fb3acca409de2343e0139a221b6b4d76734f4cfc5afe1b6dfa507b4e480") { throw "DuckDB-Wasm Release archive SHA-256 does not match the v1.0.0 release baseline." }
if ([string]$lock.manifestSha256 -ne "57503be4095621002817143180dcc314dc90537600b8b82ea40138fd6783d3e9") { throw "DuckDB-Wasm manifest SHA-256 does not match the v1.0.0 release baseline." }
if ([string]$lock.runtimeAssetSha256.api -ne "a0685dfb4c55abaa0d49f2dba827d7c714bf2b007159373b4a50349b097209d2") { throw "DuckDB-Wasm API SHA-256 does not match the v1.0.0 release baseline." }
if ([string]$lock.runtimeAssetSha256.worker -ne "c2ef3ddd2d8037e166ca69ade3767dea4bff171a9ab692ae18b961977d56e0a3") { throw "DuckDB-Wasm Worker SHA-256 does not match the v1.0.0 release baseline." }
if ([string]$lock.runtimeAssetSha256.wasm -ne "a84a1b6a94a9369975ceaecdabfc0a701dcf5dba733ad249d249a30d4b99c29e") { throw "DuckDB-Wasm WASM SHA-256 does not match the v1.0.0 release baseline." }

$cacheRoot = Join-Path $Root ".cache\duckdb-wasm-runtime\v0.1.2"
$archivePath = Join-Path $cacheRoot ([string]$lock.assetName)
$artifactDir = Join-Path $cacheRoot "artifact"

if ($ForceDownload -and (Test-Path $cacheRoot)) {
  Remove-Item -Recurse -Force $cacheRoot
}
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$needsDownload = -not (Test-Path $archivePath -PathType Leaf)
if (-not $needsDownload) {
  $cachedSha = Get-Sha256FileHex $archivePath
  if ($cachedSha -ne ([string]$lock.archiveSha256).ToLowerInvariant()) {
    Write-Warning "Cached DuckDB-Wasm Release archive hash does not match the lock. Downloading it again."
    Remove-Item -Force $archivePath
    $needsDownload = $true
  }
}

if ($needsDownload) {
  $partialPath = "$archivePath.part"
  Remove-Item -Force -ErrorAction SilentlyContinue $partialPath
  Write-Host "[DuckDB-Wasm] Downloading pinned Builder Release v0.1.2..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri ([string]$lock.downloadUrl) -OutFile $partialPath -UseBasicParsing -Headers @{ "User-Agent" = "htmlapps-duckdb-explorer/1.0.0" }
  $downloadedSha = Get-Sha256FileHex $partialPath
  if ($downloadedSha -ne ([string]$lock.archiveSha256).ToLowerInvariant()) {
    Remove-Item -Force -ErrorAction SilentlyContinue $partialPath
    throw "Downloaded DuckDB-Wasm Release archive SHA-256 mismatch."
  }
  Move-Item -Force $partialPath $archivePath
} else {
  Write-Host "[DuckDB-Wasm] Using cached pinned Builder Release archive." -ForegroundColor Cyan
}

$archiveSha = Get-Sha256FileHex $archivePath
if ($archiveSha -ne ([string]$lock.archiveSha256).ToLowerInvariant()) {
  throw "DuckDB-Wasm Release archive SHA-256 mismatch."
}

$requiredNames = @(
  "manifest.json",
  "verification.json",
  "smoke-results.json",
  "duckdb-browser.cjs",
  "duckdb-browser-eh.worker.js",
  "duckdb-eh.wasm"
)
$needsExtract = -not (Test-Path $artifactDir -PathType Container)
if (-not $needsExtract) {
  foreach ($name in $requiredNames) {
    if (-not (Test-Path (Join-Path $artifactDir $name) -PathType Leaf)) {
      $needsExtract = $true
      break
    }
  }
}

if ($needsExtract) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $artifactDir
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  Write-Host "[DuckDB-Wasm] Extracting pinned Builder Release artifact..." -ForegroundColor Cyan
  Expand-Archive -LiteralPath $archivePath -DestinationPath $artifactDir -Force
}

foreach ($name in $requiredNames) {
  $path = Join-Path $artifactDir $name
  if (-not (Test-Path $path -PathType Leaf) -or (Get-Item $path).Length -eq 0) {
    throw "Pinned DuckDB-Wasm Release artifact is missing required file: $name"
  }
}

& $VerifierPath -ArtifactDir $artifactDir

$manifestPath = Join-Path $artifactDir "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$actualManifestSha = Get-Sha256FileHex $manifestPath
if ($actualManifestSha -ne ([string]$lock.manifestSha256).ToLowerInvariant()) {
  throw "Pinned DuckDB-Wasm manifest SHA-256 does not match duckdb-wasm-runtime.lock.json."
}

$expectedHashes = $lock.runtimeAssetSha256
$checks = @(
  @{ Name = "api"; Path = (Join-Path $artifactDir "duckdb-browser.cjs") },
  @{ Name = "worker"; Path = (Join-Path $artifactDir "duckdb-browser-eh.worker.js") },
  @{ Name = "wasm"; Path = (Join-Path $artifactDir "duckdb-eh.wasm") }
)
foreach ($check in $checks) {
  $property = $expectedHashes.PSObject.Properties[[string]$check.Name]
  if ($null -eq $property) { throw "Runtime lock is missing expected hash: $($check.Name)" }
  $actual = Get-Sha256FileHex ([string]$check.Path)
  if ($actual -ne ([string]$property.Value).ToLowerInvariant()) {
    throw "Pinned DuckDB-Wasm runtime SHA-256 mismatch: $($check.Name)"
  }
}

Write-Host "[OK] Pinned DuckDB-Wasm Builder Release verified." -ForegroundColor Green
Write-Host "[OK] Archive SHA-256: $archiveSha"
Write-Host "[OK] Artifact: $artifactDir"
