# KinoSave

> **Fast, simple YouTube media downloads.**
>
> Convert a YouTube link into a compatible MP4 video or MP3 audio file,
> with the original YouTube title preserved as the filename.

![KinoSave](https://img.shields.io/badge/KinoSave-YouTube%20Downloader-c1ff24?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square)

Website: **https://kinosave.han06.web.id** — gratis, tanpa akun, tanpa biaya bulanan.

Dokumen terkait: [PRD.md](./PRD.md) (requirement & runbook) ·
[BACKEND_GUIDE.md](./BACKEND_GUIDE.md) (detail backend) ·
[PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) (analisis awal)

## Features

- MP4 video downloads with selectable resolutions: 360p, 480p, 720p, 1080p, 1440p, and 2160p when available.
- MP3 audio extraction.
- H.264/AAC MP4 output for broad desktop compatibility.
- Original YouTube title used for the downloaded filename.
- Automatic filename sanitization for Windows.
- Resolution and FPS discovery before downloading.
- Async download jobs: the request returns a job id immediately and the UI polls for status, so long videos are not cut off.
- Loading progress, clear errors, and an optional debug log.
- YouTube-only URL validation and protected downloader API.
- Windows desktop launcher that starts the downloader and tunnel automatically while the app is open.

## Architecture

```text
Browser
  -> Vercel React app + thin API adapter
  -> Cloudflare Tunnel
  -> Windows downloader (yt-dlp + ffmpeg)
  -> YouTube

desktop/ (Electron launcher)
  -> spawns the Windows downloader on 127.0.0.1:9001
  -> spawns the Cloudflare Tunnel
  -> stops both when the window closes
```

Vercel handles the UI and request validation. The Windows service performs the
actual media download and conversion because Vercel Functions are not suitable
for running `yt-dlp` and `ffmpeg` or storing large media files.

## Cara menjalankan (ringkas)

Cara utama untuk pengguna akhir — install sekali, lalu klik shortcut:

1. Jalankan `desktop/dist/KinoSave Setup 0.1.0.exe` (atau build sendiri dengan `cd desktop; npm run dist`).
2. Buka **KinoSave** dari Windows Search / Start menu.
3. Jendela terbuka → provider (port 9001) dan Cloudflare Tunnel start otomatis.
4. Tutup jendela → keduanya ikut mati (website akan balas 502/530 saat app tertutup).

Provider hanya boleh punya satu pemilik. Launcher memakai single-instance lock,
sehingga klik kedua pada shortcut hanya memunculkan jendela yang sudah ada.
Service Windows `Cloudflared` harus dibiarkan **Stopped/Manual**.

Untuk development:

```powershell
npm install
npm run dev:all          # Vite + downloader lokal
```

## Requirements

- Node.js 20+ (untuk development)
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

To make the launcher available from any folder on Windows, run this once from
the project root:

```powershell
npm link
```

After that, start the downloader and tunnel from anywhere with:

```powershell
kinosave start
```

The global command only launches the local downloader and tunnel. The project
folder, API key, tunnel credentials, `yt-dlp`, and `ffmpeg` must still exist on
the same computer.

This opens two PowerShell windows:

1. the `yt-dlp + ffmpeg` downloader on port 9001;
2. the Cloudflare Named Tunnel for `api-kinosave.han06.web.id`.

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

## Aplikasi desktop (Electron)

Launcher desktop yang menjalankan downloader lokal dan Cloudflare Tunnel hanya
selama aplikasi terbuka. Tutup aplikasi, server ikut mati.

Hanya satu instance yang boleh jalan: klik kedua kali shortcut hanya
meminculkan jendela yang sudah ada, bukan membuka instance baru yang bentrok
di port 9001.

```powershell
cd desktop
npm install
npm start
```

Isi aplikasi:

- Server downloader (`deploy/ytdlp/server.mjs`) dijalankan sebagai child process.
- Cloudflare Tunnel dijalankan sebagai child process.
- Status server dan tunnel, log, tombol Mulai/Jeda, dan tautan website.
- Deteksi port 9001 yang sudah dipakai, dengan pesan error yang jelas.

Konfigurasi bersama ada di `kinosave.config.json` (dipakai juga oleh
`scripts/start-server.ps1`): id tunnel, hostname, port service, dan URL website.

Kebutuhan lokal: `yt-dlp`, `ffmpeg`, dan `cloudflared` harus ada di PATH, dan
kredensial tunnel harus ada di `~/.cloudflared/<tunnelId>.json`.

API key dibaca berurutan dari `KINOSAVE_API_KEY`, file
`%APPDATA%\KinoSave\provider-key.txt`, `%TEMP%\kinosave-provider-key.txt`, lalu
`MEDIA_PROVIDER_API_KEY` di file yang terdaftar di `apiKeyEnvFiles` pada
`kinosave.config.json` (default: `.env.production.local` dan `.env.local` di
folder proyek).

Rotasi kunci: `kinosave.config.json` punya `apiKeyHashes`, daftar SHA-256 kunci
yang tetap diterima, supaya kunci lama di Vercel tidak perlu langsung diganti.
Log provider ditulis ke `logs/server.log` (mode dev) atau
`%APPDATA%\KinoSave\logs\server.log` (mode installed). File hasil download
disimpan di `%APPDATA%\KinoSave\downloads`.

Untuk membuat installer Windows:

```powershell
cd desktop
npm run dist
```

Hasil installer ada di `desktop/dist`. Installer (`KinoSave Setup 0.1.0.exe`)
membuat shortcut Start menu dan Desktop, jadi aplikasi bisa dibuka dari
Windows Search. Bawaan mode installed:

- `kinosave.config.json` dan `deploy/ytdlp/server.mjs` dibundel ke
  `resources/app` di dalam app.
- Folder kerja (logs, downloads) dipindah ke `%APPDATA%\KinoSave`.
- Tidak ada API key di dalam installer; kunci dibaca dari file proyek yang
  terdaftar di `apiKeyEnvFiles`.


## Alur download

Provider membalas `202` dengan `jobId` lalu memproses download di background.
Frontend polling `GET /api/status?job=<id>` sampai `done`, baru menampilkan
tautan file. Ini wajib karena Cloudflare memutus request origin yang lebih
dari 100 detik (HTTP 524).

Kontrak API singkat:

| Endpoint | Keterangan |
| --- | --- |
| `POST /api/info` | Metadata video: judul, daftar resolusi, daftar fps |
| `POST /api/download` | Mulai job download, balas `202 { status, jobId, logs }` |
| `GET /api/status?job=<id>` | Status job: `processing` / `done` / `error` |
| `GET /files/<nama-file>` | Stream file media hasil download |

## Production environment

Configure these Vercel environment variables:

```env
MEDIA_PROVIDER_URL=https://api-kinosave.han06.web.id/api/download
MEDIA_PROVIDER_API_KEY=<same key as LOCAL_DOWNLOAD_API_KEY>
```

The downloader uses:

```env
PUBLIC_BASE_URL=https://api-kinosave.han06.web.id
LOCAL_DOWNLOAD_API_KEY=<secret key>
```

Never commit API keys, cookies, or local environment files.

Deploy ke production = push ke branch `main` (Vercel auto-deploy dari repo
GitHub). Rotasi env var Vercel dilakukan manual lewat dashboard.

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
- The provider only accepts YouTube URLs and requires `Authorization: Api-Key <key>`.
- Limit the service to content you are allowed to save.
- Downloaded files are temporary and are cleaned automatically after one hour.
- The downloader limits concurrent jobs and rejects non-YouTube URLs.
- Never run two KinoSave instances on one machine: the second one would collide on port 9001.

See [BACKEND_GUIDE.md](./BACKEND_GUIDE.md) for backend deployment details and
troubleshooting.
