$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$keyFile = Join-Path $env:TEMP 'kinosave-provider-key.txt'
$tunnelName = 'kinosave-api'
$tunnelId = '5d0a4b75-4de9-4ec0-9335-bd66557fcb27'
$tunnelConfig = Join-Path $env:TEMP 'kinosave-api-tunnel.yml'
$tunnelCredentials = Join-Path $HOME ".cloudflared\$tunnelId.json"
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
if (-not (Test-Path $tunnelCredentials)) {
  throw "Kredensial tunnel tidak ditemukan: $tunnelCredentials"
}

$apiKey = (Get-Content $keyFile -Raw).Trim()
if (-not $apiKey) {
  throw 'API key lokal kosong.'
}

$tunnelConfiguration = @"
tunnel: $tunnelId
credentials-file: $tunnelCredentials
protocol: quic
ingress:
  - hostname: api-kinosave.han06.web.id
    service: http://127.0.0.1:9001
  - service: http_status:404
"@
Set-Content -Path $tunnelConfig -Value $tunnelConfiguration -Encoding utf8

$serverCommand = "`$env:PUBLIC_BASE_URL='$publicBaseUrl'; `$env:LOCAL_DOWNLOAD_API_KEY='$apiKey'; Set-Location '$projectRoot'; npm run download-server"
$tunnelCommand = "Set-Location '$projectRoot'; cloudflared tunnel --config '$tunnelConfig' run $tunnelName"

Start-Process powershell.exe -ArgumentList '-NoExit', '-NoLogo', '-Command', $serverCommand
Start-Process powershell.exe -ArgumentList '-NoExit', '-NoLogo', '-Command', $tunnelCommand

Write-Host 'KinoSave downloader dan Cloudflare Tunnel sedang dijalankan.'
Write-Host "Website: https://kinosave.han06.web.id"
Write-Host "Backend: $publicBaseUrl"
