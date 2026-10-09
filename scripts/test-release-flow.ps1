$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Run the real release orchestration against tiny local build-step doubles.
# This verifies that a stale root alias cannot block the build needed to refresh it.
$Root = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("duckdb-release-flow-" + [Guid]::NewGuid().ToString("N"))
try {
  $scripts = Join-Path $tempRoot "scripts"
  New-Item -ItemType Directory -Force -Path $scripts | Out-Null
  Copy-Item (Join-Path $PSScriptRoot "prepare-release.ps1") (Join-Path $scripts "prepare-release.ps1")
  Set-Content (Join-Path $tempRoot "duckdb-explorer.html") "stale" -Encoding UTF8
  foreach ($name in @("check-powershell-syntax.ps1", "sync-dependency-lock.ps1", "generate-test-data.ps1", "fetch-duckdb-wasm-runtime.ps1")) {
    Set-Content (Join-Path $scripts $name) 'param([switch]$ForceDownload)' -Encoding UTF8
  }
  Set-Content (Join-Path $scripts "check-repository.ps1") @'
param([switch]$SkipRootReleaseChecks)
$root = Split-Path -Parent $PSScriptRoot
if (-not $SkipRootReleaseChecks) {
  $alias = (Get-Content -Raw (Join-Path $root "duckdb-explorer.html")).Trim()
  if ($alias -ne "verified-current") { throw "Root alias blocked the pre-build source checks." }
  Set-Content (Join-Path $root "root-checked") "yes"
}
'@ -Encoding UTF8
  Set-Content (Join-Path $tempRoot "build-standalone.ps1") @'
param([string]$DuckDBWasmArtifactDir, [switch]$ForceDownload)
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "dist") | Out-Null
Set-Content (Join-Path $PSScriptRoot "dist/index.html") "verified-current"
'@ -Encoding UTF8
  Set-Content (Join-Path $scripts "check-release.ps1") @'
param([switch]$RequireBuiltOutput)
$root = Split-Path -Parent $PSScriptRoot
if (-not $RequireBuiltOutput) { throw "Built output was not requested." }
if ((Get-Content -Raw (Join-Path $root "duckdb-explorer.html")).Trim() -ne "stale") { throw "Root alias was published before release verification." }
if ((Get-Content -Raw (Join-Path $root "dist/index.html")).Trim() -ne "verified-current") { throw "The release did not build." }
'@ -Encoding UTF8
  New-Item -ItemType Directory -Force -Path (Join-Path $tempRoot "tests") | Out-Null
  Set-Content (Join-Path $tempRoot "tests/icon-brand.test.cjs") @'
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.equal(process.argv[2], 'dist/index.html');
assert.equal(fs.readFileSync(process.argv[2], 'utf8').trim(), 'verified-current');
fs.writeFileSync('icon-checked', 'yes');
'@ -Encoding UTF8
  & (Join-Path $scripts "prepare-release.ps1")
  if (-not (Test-Path (Join-Path $tempRoot "icon-checked"))) { throw "Built icon regression was not run." }
  if (-not (Test-Path (Join-Path $tempRoot "root-checked"))) { throw "Updated root alias was not verified." }
  Set-Content (Join-Path $tempRoot "duckdb-explorer.html") "stale" -Encoding UTF8
  Set-Content (Join-Path $scripts "check-release.ps1") 'param([switch]$RequireBuiltOutput); throw "Fictional release verification failure"' -Encoding UTF8
  $failedAsExpected = $false
  try { & (Join-Path $scripts "prepare-release.ps1") } catch {
    if ($_.Exception.Message -notlike "*Fictional release verification failure*") { throw }
    $failedAsExpected = $true
  }
  if (-not $failedAsExpected) { throw "Release verification failure was ignored." }
  if ((Get-Content -Raw (Join-Path $tempRoot "duckdb-explorer.html")).Trim() -ne "stale") { throw "Failed output replaced the tracked alias." }
  Write-Host "[OK] Release flow rebuilds, verifies, synchronizes, and checks a stale root alias; failed verification preserves it."
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
