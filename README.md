# KinoSave

> **Fast, simple YouTube media downloads.**
>
> Convert a YouTube link into a compatible MP4 video or MP3 audio file,
> with the original YouTube title preserved as the filename.

![KinoSave](https://img.shields.io/badge/KinoSave-YouTube%20Downloader-c1ff24?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square)

## Features

- MP4 video downloads with selectable resolutions: 360p, 480p, 720p, 1080p, 1440p, and 2160p when available.
- MP3 audio extraction.
- H.264/AAC MP4 output for broad desktop compatibility.
- Original YouTube title used for the downloaded filename.
- Automatic filename sanitization for Windows.
- Resolution discovery before downloading.
- Loading progress, clear errors, and an optional debug log.
- YouTube-only URL validation and protected downloader API.

## Architecture

```text
Browser
  -> Vercel React app + thin API adapter
  -> Cloudflare Tunnel
  -> Windows downloader (yt-dlp + ffmpeg)
  -> YouTube
```

Vercel handles the UI and request validation. The Windows service performs the
actual media download and conversion because Vercel Functions are not suitable
for running `yt-dlp` and `ffmpeg` or storing large media files.

## Requirements

- Node.js 20+
- `yt-dlp`
- `ffmpeg`
- `cloudflared`
- A configured Cloudflare Named Tunnel pointing to `http://127.0.0.1:9001`

On Windows, the media tools can be installed with Chocolatey:

```powershell
choco install yt-dlp ffmpeg -y
```

## One-command server startup

After the Cloudflare Named Tunnel and local key have been configured, run this
from the project root:

```powershell
npm run start:server
```

This opens two PowerShell windows:

1. the `yt-dlp + ffmpeg` downloader on port 9001;
2. the Cloudflare Named Tunnel for `kinosave.han06.web.id`.

The script expects these local files, which are intentionally outside Git:

```text
%TEMP%\kinosave-provider-key.txt
%TEMP%\kinosave-tunnel.yml
```

To start only the Vite frontend during development:

```powershell
npm run dev
```

To start Vite and the local downloader together:

```powershell
npm run dev:all
```

## Production environment

Configure these Vercel environment variables:

```env
MEDIA_PROVIDER_URL=https://kinosave.han06.web.id/api/download
MEDIA_PROVIDER_API_KEY=<same key as LOCAL_DOWNLOAD_API_KEY>
```

The downloader uses:

```env
PUBLIC_BASE_URL=https://kinosave.han06.web.id
LOCAL_DOWNLOAD_API_KEY=<secret key>
```

Never commit API keys, cookies, or local environment files.

## Development commands

```powershell
npm install
npm run build
npm run lint
npm run preview
```

## File naming

The downloader obtains the title from `yt-dlp`, removes characters that are
invalid in Windows filenames, and returns names such as:

```text
My YouTube Video.mp4
My YouTube Video.mp3
```

Duplicate names receive a safe suffix such as `(2)`.

## Security and operations

- Keep the downloader API key private.
- Keep the Named Tunnel and downloader running for downloads to work.
- Limit the service to content you are allowed to save.
- Downloaded files are temporary and are cleaned automatically.
- The downloader limits concurrent jobs and rejects non-YouTube URLs.

See [BACKEND_GUIDE.md](./BACKEND_GUIDE.md) for backend deployment details and
troubleshooting.
