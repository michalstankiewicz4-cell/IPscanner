#Requires -Version 5.1
<#
  One-line installer for OSINT NET Auditor (Windows).

  Usage (from any PowerShell prompt):
    irm https://raw.githubusercontent.com/michalstankiewicz4-cell/IPscanner/main/install.ps1 | iex

  Downloads the latest release's NSIS installer - via the same latest.json
  the app's own in-app auto-updater already reads, so this always installs
  exactly what "Check for updates" would offer - and runs it silently.
  Pass -Interactive to see the normal install wizard instead of a silent
  install.
#>
param(
  [switch]$Interactive
)

$ErrorActionPreference = "Stop"

if ($env:OS -notlike "*Windows*") {
  Write-Error "This installer is for Windows only."
  exit 1
}

$latestJsonUrl = "https://github.com/michalstankiewicz4-cell/IPscanner/releases/latest/download/latest.json"

Write-Host "OSINT NET Auditor installer" -ForegroundColor Cyan
Write-Host "Checking latest release..."

try {
  $manifest = Invoke-RestMethod -Uri $latestJsonUrl -UseBasicParsing
} catch {
  Write-Error "Could not reach GitHub releases: $($_.Exception.Message)"
  exit 1
}

$version = $manifest.version
$installerUrl = $manifest.platforms.'windows-x86_64'.url
if (-not $installerUrl) {
  Write-Error "Could not find a Windows installer URL in the release manifest."
  exit 1
}

Write-Host "Latest version: v$version"

$tempDir = Join-Path $env:TEMP "osint-net-auditor-install"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$installerPath = Join-Path $tempDir (Split-Path $installerUrl -Leaf)

Write-Host "Downloading installer..."
try {
  Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
} catch {
  Write-Error "Download failed: $($_.Exception.Message)"
  exit 1
}

if (-not (Test-Path $installerPath) -or (Get-Item $installerPath).Length -eq 0) {
  Write-Error "Downloaded file is missing or empty."
  exit 1
}

Write-Host "Installing..."
$installerArgs = if ($Interactive) { @() } else { @("/S") }
$proc = Start-Process -FilePath $installerPath -ArgumentList $installerArgs -Wait -PassThru

if ($proc.ExitCode -ne 0) {
  Write-Error "Installer exited with code $($proc.ExitCode)."
  exit $proc.ExitCode
}

Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

Write-Host "Done! OSINT NET Auditor v$version installed." -ForegroundColor Green

$installedExe = Join-Path $env:LOCALAPPDATA "OSINT NET Auditor\OSINTNETAuditor.exe"
if (Test-Path $installedExe) {
  Write-Host "Launching..."
  Start-Process -FilePath $installedExe
}
