$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$keyFile = Join-Path $env:TEMP 'kinosave-provider-key.txt'
$tunnelConfig = Join-Path $env:TEMP 'kinosave-tunnel.yml'
$publicBaseUrl = 'https://api-kinosave.han06.web.id'

if (-not (Test-Path (Join-Path $projectRoot 'deploy\ytdlp\server.mjs'))) {
  throw "Folder project KinoSave tidak valid: $projectRoot"
}
if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
  throw 'yt-dlp tidak ditemukan di PATH.'
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'ffmpeg tidak ditemukan di PATH.'
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared tidak ditemukan di PATH.'
}
if (-not (Test-Path $keyFile)) {
  throw "API key lokal tidak ditemukan: $keyFile"
}
if (-not (Test-Path $tunnelConfig)) {
  throw "Konfigurasi tunnel tidak ditemukan: $tunnelConfig"
}

$apiKey = (Get-Content $keyFile -Raw).Trim()
if (-not $apiKey) {
  throw 'API key lokal kosong.'
}

$serverCommand = "`$env:PUBLIC_BASE_URL='$publicBaseUrl'; `$env:LOCAL_DOWNLOAD_API_KEY='$apiKey'; Set-Location '$projectRoot'; npm run download-server"
$tunnelCommand = "Set-Location '$projectRoot'; cloudflared tunnel --config '$tunnelConfig' run kinosave"

Start-Process powershell.exe -ArgumentList '-NoExit', '-NoLogo', '-Command', $serverCommand
Start-Process powershell.exe -ArgumentList '-NoExit', '-NoLogo', '-Command', $tunnelCommand

Write-Host 'KinoSave downloader dan Cloudflare Tunnel sedang dijalankan.'
Write-Host "Website: https://kinosave.han06.web.id"
Write-Host "Backend: $publicBaseUrl"
