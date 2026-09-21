# Runs both test suites. From the repo root:  .\run_tests.ps1
#
# There are two because the project is two languages: Python for training,
# JavaScript for the live site. Both must pass before deploying.

$ErrorActionPreference = "Stop"

Write-Host "`n=== Python tests ===" -ForegroundColor Cyan
& .\.venv\Scripts\python.exe -m unittest discover
if ($LASTEXITCODE -ne 0) { Write-Host "Python tests FAILED" -ForegroundColor Red; exit 1 }

Write-Host "`n=== JavaScript tests ===" -ForegroundColor Cyan
& node tests/js/test_features.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "JavaScript tests FAILED" -ForegroundColor Red; exit 1 }

& node tests/js/test_highlight.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "JavaScript tests FAILED" -ForegroundColor Red; exit 1 }

& node tests/js/test_validate.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "JavaScript tests FAILED" -ForegroundColor Red; exit 1 }


Write-Host "`nAll tests passed." -ForegroundColor Green
