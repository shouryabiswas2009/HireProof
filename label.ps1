# Starts the labelling tool and opens it in your browser.
#
# Usage: right-click this file and choose "Run with PowerShell",
# or from a terminal in this folder:   .\label.ps1
#
# Press Ctrl+C in the window to stop it when you are done.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Host "No virtual environment found. Run this first:" -ForegroundColor Red
    Write-Host "    python -m venv .venv"
    Write-Host "    .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    exit 1
}

Write-Host ""
Write-Host "  HireProof labelling tool" -ForegroundColor Cyan
Write-Host "  Opening http://127.0.0.1:5000 in your browser..."
Write-Host "  Press Ctrl+C here when you are finished." -ForegroundColor DarkGray
Write-Host ""

# Open the browser a moment after the server starts, so the page isn't
# requested before Flask is listening.
Start-Job { Start-Sleep -Seconds 2; Start-Process "http://127.0.0.1:5000" } | Out-Null

& .\.venv\Scripts\python.exe -m labeler.app
