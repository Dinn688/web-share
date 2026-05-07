param(
  [string]$TaskName = "WebShare",
  [switch]$AtStartup
)

$ErrorActionPreference = "Stop"
$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$RunScript = Join-Path $AppDir "scripts\run-server.ps1"

if ($AtStartup) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "The -AtStartup option requires an elevated PowerShell window."
  }
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`" -LogToFile"

if ($AtStartup) {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
} else {
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Start LinShare / web-share file sharing service." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started scheduled task: $TaskName"
