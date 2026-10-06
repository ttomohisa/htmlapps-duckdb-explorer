param(
  [switch]$ForceDownload,
  [string]$DuckDBWasmArtifactDir = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  Write-Host "[1/7] Validating PowerShell syntax..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "check-powershell-syntax.ps1")

  Write-Host "[2/7] Resolving embedded dependency lock..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "sync-dependency-lock.ps1") -ForceDownload:$ForceDownload

  Write-Host "[3/7] Generating DuckDB regression databases..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "generate-test-data.ps1")

  Write-Host "[4/7] Checking repository and release contract..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "check-repository.ps1") -SkipRootReleaseChecks

  Write-Host "[5/7] Resolving verified DuckDB-Wasm runtime..." -ForegroundColor Cyan
  $artifactDir = ""
  if ([string]::IsNullOrWhiteSpace($DuckDBWasmArtifactDir)) {
    & (Join-Path $PSScriptRoot "fetch-duckdb-wasm-runtime.ps1") -ForceDownload:$ForceDownload
    $artifactDir = Join-Path $Root ".cache\duckdb-wasm-runtime\v0.1.2\artifact"
  } else {
    if ([System.IO.Path]::IsPathRooted($DuckDBWasmArtifactDir)) {
      $artifactDir = [System.IO.Path]::GetFullPath($DuckDBWasmArtifactDir)
    } else {
      $artifactDir = [System.IO.Path]::GetFullPath((Join-Path $Root $DuckDBWasmArtifactDir))
    }
    & (Join-Path $PSScriptRoot "verify-custom-duckdb-wasm.ps1") -ArtifactDir $artifactDir
  }

  Write-Host "[6/7] Building release standalone HTML with matched Builder runtime..." -ForegroundColor Cyan
  & (Join-Path $Root "build-standalone.ps1") -DuckDBWasmArtifactDir $artifactDir -ForceDownload:$ForceDownload

  Write-Host "[7/7] Verifying release outputs..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "check-release.ps1") -RequireBuiltOutput

  # Refresh the tracked alias only after the generated release has passed verification.
  Copy-Item -Force (Join-Path $Root "dist/index.html") (Join-Path $Root "duckdb-explorer.html")
  & (Join-Path $PSScriptRoot "check-repository.ps1")

  Write-Host "[OK] DuckDB Explorer v1.0.1 release build is ready." -ForegroundColor Green
} finally {
  Pop-Location
}
