param(
  [string]$DuckDbExe = "",
  [switch]$KeepToolCache
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Version = "v1.4.0"
$CacheDir = Join-Path $Root ".cache/duckdb-cli-$Version"
$ZipPath = Join-Path $CacheDir "duckdb_cli-windows-amd64.zip"
$Downloaded = $false
$ExpectedWindowsZipSha256 = "efceab16ece9e6be24ddd1ce82a58ca23d27bc4c5defbea40e3bcb82adeed41a"

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

$Fixtures = @(
  [ordered]@{
    Name = "base"
    Sql = Join-Path $Root "test-data/browser-kitty-sample.sql"
    Output = Join-Path $Root "test-data/browser-kitty-sample.duckdb"
    Verify = "SELECT (SELECT count(*) FROM main.customers) AS customers, (SELECT count(*) FROM main.orders) AS orders, (SELECT count(*) FROM main.order_items) AS items, (SELECT count(*) FROM main.binary_samples) AS binary_samples;"
  },
  [ordered]@{
    Name = "comparison"
    Sql = Join-Path $Root "test-data/browser-kitty-sample-after.sql"
    Output = Join-Path $Root "test-data/browser-kitty-sample-after.duckdb"
    Verify = "SELECT (SELECT count(*) FROM main.customers) AS customers, (SELECT count(*) FROM main.orders) AS orders, (SELECT count(*) FROM main.products) AS products, (SELECT count(*) FROM archive.closed_orders) AS archived;"
  }
)

foreach ($fixture in $Fixtures) {
  if (-not (Test-Path $fixture.Sql)) { throw "SQL fixture not found: $($fixture.Sql)" }
}

if ([string]::IsNullOrWhiteSpace($DuckDbExe)) {
  $command = Get-Command duckdb -ErrorAction SilentlyContinue
  if ($command) {
    $DuckDbExe = $command.Source
  } else {
    New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
    $DuckDbExe = Join-Path $CacheDir "duckdb.exe"
    if (-not (Test-Path $DuckDbExe)) {
      $url = "https://github.com/duckdb/duckdb/releases/download/$Version/duckdb_cli-windows-amd64.zip"
      Write-Host "Downloading DuckDB CLI $Version..."
      Invoke-WebRequest -Uri $url -OutFile $ZipPath -UseBasicParsing
      $actualHash = Get-Sha256FileHex $ZipPath
      if ($actualHash -ne $ExpectedWindowsZipSha256) {
        Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
        throw "DuckDB CLI SHA-256 mismatch. Expected $ExpectedWindowsZipSha256 but got $actualHash"
      }
      Expand-Archive -Path $ZipPath -DestinationPath $CacheDir -Force
      $Downloaded = $true
    }
  }
}

if (-not (Test-Path $DuckDbExe)) { throw "DuckDB CLI was not found: $DuckDbExe" }

$versionText = (& $DuckDbExe --version | Out-String).Trim()
Write-Host "Using: $versionText"

foreach ($fixture in $Fixtures) {
  Write-Host "Generating $($fixture.Name) fixture..."
  if (Test-Path $fixture.Output) { Remove-Item -Force $fixture.Output }
  $sql = Get-Content -Raw -Encoding UTF8 $fixture.Sql
  $sql | & $DuckDbExe $fixture.Output
  if ($LASTEXITCODE -ne 0) { throw "DuckDB CLI failed while generating fixture: $($fixture.Name)" }

  $verification = (& $DuckDbExe $fixture.Output -csv -c $fixture.Verify | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "DuckDB CLI failed while verifying fixture: $($fixture.Name)" }
  Write-Host "Verification ($($fixture.Name)): $verification"
  Write-Host "[OK] Generated: $($fixture.Output)" -ForegroundColor Green
}

if ($Downloaded -and -not $KeepToolCache) {
  Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
}
