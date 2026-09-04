$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$parseErrors = @()

Get-ChildItem -Path $Root -Recurse -Filter "*.ps1" -File | ForEach-Object {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors)
  foreach ($errorItem in @($errors)) {
    $parseErrors += "$($_.FullName):$($errorItem.Extent.StartLineNumber): $($errorItem.Message)"
  }
}

if ($parseErrors.Count -gt 0) {
  throw ("PowerShell syntax check failed:`n" + ($parseErrors -join "`n"))
}

Write-Host "[OK] PowerShell syntax check passed." -ForegroundColor Green
