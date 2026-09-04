@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo dist\index.html was not found.
  echo Run build-standalone.bat first.
  pause
  exit /b 1
)
start "DuckDB Explorer" "dist\index.html"
endlocal
