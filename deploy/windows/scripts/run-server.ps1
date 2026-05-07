param(
  [switch]$LogToFile,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $AppDir

$ConfigFile = Join-Path $AppDir "config\windows.env.ps1"
if (Test-Path $ConfigFile) {
  . $ConfigFile
}

if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "5832" }
if (-not $env:PORT_RETRY_LIMIT) { $env:PORT_RETRY_LIMIT = "20" }
if (-not $env:DATA_DIR) { $env:DATA_DIR = ".\data" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 18 or later, then run start.bat again."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js with npm enabled."
}
$NodeMajor = [int]((& node -p "process.versions.node.split('.')[0]") -as [string])
if ($NodeMajor -lt 18) {
  throw "Node.js 18 or later is required. Current version: $(& node -v)."
}

New-Item -ItemType Directory -Force -Path $env:DATA_DIR, "logs" | Out-Null

if (-not (Test-Path (Join-Path $AppDir "node_modules"))) {
  npm ci --omit=dev --no-audit --no-fund
}

if ($CheckOnly) {
  Write-Host "环境检查通过，服务将后台启动。"
  exit 0
}

if ($LogToFile) {
  $LogFile = Join-Path $AppDir "logs\server.log"
  "[$(Get-Date -Format o)] starting web-share on port $env:PORT" | Out-File -FilePath $LogFile -Append -Encoding utf8
  & node (Join-Path $AppDir "server.js") *>> $LogFile
  exit $LASTEXITCODE
}

& node (Join-Path $AppDir "server.js")
exit $LASTEXITCODE
