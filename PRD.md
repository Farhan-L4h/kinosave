# PRD — KinoSave

> Product Requirements Document untuk KinoSave: unduh video (MP4) dan audio (MP3)
> dari YouTube lewat website gratis, dengan downloader yang jalan di komputer
> sendiri dan tidak butuh server berbayar.

| Field | Nilai |
| --- | --- |
| Versi dokumen | 1.0 |
| Tanggal | 2026-11-21 |
| Owner | Farhan (kinosave.han06.web.id) |
| Status | Dipakai (v0.1.0 ter-install di Windows) |
| Repo | `github.com/Farhan-L4h/kinosave` |
| Stack | React 19 + TypeScript + Vite 7 (Vercel) · Node (provider) · Electron 45 (launcher) |

---

## 1. Latar belakang & masalah

Website downloader gratis umumnya punya dua mode: website yang seluruhnya di-host
(backend berbayar, kuota, bisa diblokir) atau website yang butuh downloader lokal
(user harus bikin folder, install `yt-dlp`, buka PowerShell, copy URL tunnel, ngerti
service Windows). Dua-duanya bad UX buat orang awam.

KinoSave sekarang: app web gratis, tapi begitu diklik-Jalankan, semua backend
menyala otomatis. Tidak ada biaya bulanan, tidak ada akun, tidak ada setup
manual per pengguna.

### Keputusan arsitektur (Model A)

> Downloader lokal + Cloudflare Named Tunnel, **dijalankan hanya selama aplikasi
> desktop terbuka**.

Alternatif yang ditolak: memindahkan provider ke VPS gratis (butuh kartu
kredit untuk verifikasi, kuota IP, dan tetap ada biaya tersembunyi) atau
membayar worker berbayar.

---

## 2. Target pengguna & use case

| Persona | Kebutuhan | Pain point yang diselesaikan |
| --- | --- | --- |
| User casual | Tempel link YouTube, unduh MP4/MP3 | Tidak mau install `yt-dlp`/ffmpeg/terminal |
| User power | Pilih resolusi/fps spesifik, judul file rapi | Download YT sering gagal di web, filename berantakan |
| Developer/owner | Deploy gratis, tanpa biaya bulanan | Backend downloader mahal, kuota free tier habis |

Use case utama: **unduh satu video YouTube** (video atau audio) dalam < 5 menit
tanpa akun dan tanpa instalasi.

---

## 3. Lingkup

### 3.1 Termasuk (v1)

- Website React di Vercel: input URL, pilih format (video/audio), resolusi,
  fps, progress, riwayat download lokal, debug log.
- API adapter Vercel (`/api/info`, `/api/download`, `/api/status`) yang
  memvalidasi request lalu meneruskan ke provider.
- Provider lokal Node: `yt-dlp` + `ffmpeg`, hanya menerima host YouTube, key API
  wajib, batas concurrency, auto-purge file.
- Cloudflare Named Tunnel sebagai exposure provider tanpa port publik.
- Launcher desktop Electron (NSIS installer): start/stop provider + tunnel,
  status, log, tombol Mulai/Jeda, tautan website.
- Async job pattern (202 + polling) untuk download yang lebih dari 100 detik.

### 3.2 Tidak Termasuk (v1)

- Batch/playlist download.
- Codec di luar H.264/AAC MP4 dan MP3.
- Akun pengguna, login, riwayat tersinkron antar device.
- Dukungan platform selain Windows untuk launcher (provider bisa Linux/macOS,
  tapi installer hanya Windows).
- Monetisasi, iklan, analytics pihak ketiga.

---

## 4. Persyaratan fungsional

| ID | Persyaratan | Status |
| --- | --- | --- |
| FR-01 | User menempelkan URL YouTube, sistem memvalidasi host (hanya `youtube.com`, `www`, `m`, `music`, `youtu.be`) | Selesai |
| FR-02 | Setelah URL valid, sistem mengambil metadata (judul, daftar resolusi, daftar fps) sebelum user memilih | Selesai |
| FR-03 | User memilih format `video` atau `audio` | Selesai |
| FR-04 | User memilih resolusi 360/480/720/1080/1440/2160 (hanya yang tersedia untuk video itu) | Selesai |
| FR-05 | User memilih fps dari fps yang tersedia (15/30/60) | Selesai |
| FR-06 | Audio menghasilkan MP3, video menghasilkan MP4 H.264/AAC kompatibel | Selesai |
| FR-07 | Nama file = judul YouTube, dibersihkan dari karakter ilegal Windows, duplikat dapat sufiks `(2)` | Selesai |
| FR-08 | Download berjalan sebagai job async: server membalas `202 {jobId}`, UI polling status | Selesai |
| FR-09 | Progress UI menampilkan tahap (metadata → unduh → convert → siap) | Selesai |
| FR-10 | User bisa membatalkan request yang sedang berjalan | Selesai |
| FR-11 | Download yang gagal menampilkan pesan akurat (termasuk penyebab throttle YouTube) | Selesai |
| FR-12 | Tombol "Tes koneksi" memverifikasi rantai website ↔ provider | Selesai |
| FR-13 | Launcher Electron menyalakan provider + tunnel otomatis saat dibuka, dan mematikan keduanya saat ditutup | Selesai |
| FR-14 | Launcher menampilkan status server/tunnel, log runtime, dan tautan website | Selesai |
| FR-15 | Hanya satu instance launcher boleh jalan; klik kedua memunculkan jendela yang ada | Selesai |
| FR-16 | Histori 10 download terakhir disimpan di `localStorage` | Selesai |

## 5. Persyaratan non-fungsional

| ID | Persyaratan | Target |
| --- | --- | --- |
| NFR-01 | Biaya hosting | 0 rupiah/bulan (Vercel Hobby + Cloudflare Free + Named Tunnel) |
| NFR-02 | Waktu balas metadata | < 15 detik |
| NFR-03 | Request download | < 2 detik (balasan `202`, bukan menunggu file) |
| NFR-04 | File download | Tidak terkena limit 100 detik Cloudflare (di-serve dari `/files/*`) |
| NFR-05 | Keamanan API | Provider menolak request tanpa `Authorization: Api-Key <key>` |
| NFR-06 | Isolasi resource | Maksimal 2 job download berjalan bersamaan |
| NFR-07 | Retensi file | File di `downloads/` dihapus otomatis setelah 1 jam |
| NFR-08 | Batas durasi | Video > 30 menit ditolak (`--match-filter duration <= 1800`) |
| NFR-09 | Log | Provider menulis request log ke `server.log`; stderr provider ditampilkan di UI launcher |
| NFR-10 | Secrets | API key tidak pernah masuk repo atau installer; hanya SHA-256 hash yang boleh di config |
| NFR-11 | UX offline | Jika app ditutup, website menampilkan error jelas, bukan diam |

---

## 6. Arsitektur

```text
┌──────────────────────────┐
│ Browser (user)           │
│ kinosave.han06.web.id    │  ← React 19 + Vite (Vercel, static)
└───────────┬──────────────┘
            │ /api/info · /api/download · /api/status
┌───────────▼──────────────┐
│ Vercel Functions (adapter)│  validasi URL/format/quality/fps, tebak env
└───────────┬──────────────┘
            │ Authorization: Api-Key <key>
┌───────────▼──────────────┐
│ Cloudflare Named Tunnel  │  api-kinosave.han06.web.id
└───────────┬──────────────┘
┌───────────▼──────────────┐
│ Provider lokal (Node)    │  127.0.0.1:9001
│  deploy/ytdlp/server.mjs │  yt-dlp + ffmpeg, 2 job max, purge 1 jam
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│ YouTube                  │
└──────────────────────────┘

Launcher Electron (desktop/)
  ├─ child process: provider  (ELECTRON_RUN_AS_NODE=1)
  └─ child process: cloudflared tunnel
```

### 6.1 Peran tiap komponen

| Komponen | Tanggung jawab | Tidak boleh |
| --- | --- | --- |
| React (Vercel) | UI, state, polling, unduh file ke browser | Menjalankan `yt-dlp`, menyimpan file media |
| Vercel Function | Validasi input, auth ke provider, penerjemahan error | Menyimpan media > 100 detik, menyimpan rahasia di kode |
| Provider lokal | Download, convert, sajikan file, auth key | Menerima URL non-YouTube, menjalankan > 2 job |
| Tunnel | Exposure HTTP publik ke `127.0.0.1` | Menyimpan data |
| Launcher | Start/stop provider + tunnel, status, log | Menjalankan download sendiri |

---

## 7. Kontrak API

### 7.1 `POST /api/info` (tanpa auth)

```json
// request
{ "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ" }

// response 200
{ "title": "Big Buck Bunny ...", "resolutions": ["360","480","720"], "fps": [15,30,60] }
```

Error: `400` (URL bukan YouTube), `502` (metadata gagal diambil).

### 7.2 `POST /api/download`

```json
// request
{ "url": "...", "quality": "360", "fps": 30, "format": "video" }

// response 202
{ "status": "processing", "jobId": "0a846196-...", "logs": ["[backend] ..."] }
```

`fps` harus **number**. Error: `400` (validasi), `502` (provider tidak merespons / gagal mulai job).

### 7.3 `GET /api/status?job=<jobId>`

```json
{ "status": "processing" }
{ "status": "done", "url": "https://api-kinosave.han06.web.id/files/nama-file.mp4", "filename": "nama-file.mp4" }
{ "status": "error", "error": "Download gagal di server. ..." }
```

### 7.4 `GET /files/<nama-file>`

Stream file media (tidak butuh auth; URL-nya sendiri sudah acak + TTL 1 jam).

---

## 8. Model keamanan

1. **Auth provider**: header `Authorization: Api-Key <key>` (bukan `Api-Key:`).
   Key dibandingkan dengan plaintext env atau SHA-256 hash yang ada di
   `apiKeyHashes`.
2. **Rotasi key**: tambah hash key lama ke `apiKeyHashes` → deploy key baru ke
   Vercel → hapus hash lama. Tidak ada plaintext lama yang perlu disimpan.
3. **URL allowlist**: hanya host YouTube; URL lain ditolak di adapter dan provider.
4. **Batas beban**: max 2 job aktif, durasi max 30 menit, file dihapus setelah 1 jam.
5. **Secret handling**: `.env*` dan `desktop/dist` tidak masuk Git; installer tidak
   memuat API key (dibaca runtime dari file yang didaftarkan di `apiKeyEnvFiles`).
6. **Launcher**: `contextIsolation: true`, `nodeIntegration: false`, preload
   narrowed ke 5 channel IPC.

---

## 9. Operasional & deployment

### 9.1 Deployment

- **Frontend + API**: Vercel, auto-deploy saat `git push` ke `main`.
- **Provider + tunnel**: dijalankan oleh launcher desktop di Windows.
- **Registrasi tunnel**: Named Tunnel `kinosave-api` dengan kredensial di
  `~/.cloudflared/<tunnelId>.json`.

### 9.2 Env Vercel

```env
MEDIA_PROVIDER_URL=https://api-kinosave.han06.web.id/api/download
MEDIA_PROVIDER_API_KEY=<key yang sama dengan LOCAL_DOWNLOAD_API_KEY>
```

### 9.3 Konfigurasi lokal (`kinosave.config.json`)

```json
{
  "tunnelId": "5d0a4b75-4de9-4ec0-9335-bd66557fcb27",
  "tunnelName": "kinosave-api",
  "hostname": "api-kinosave.han06.web.id",
  "servicePort": 9001,
  "websiteUrl": "https://kinosave.han06.web.id",
  "manageTunnel": true,
  "apiKeyHashes": [],
  "apiKeyEnvFiles": ["D:\\Documents\\Project\\kinosave\\.env.production.local"]
}
```

### 9.4 Prasyarat mesin

`yt-dlp`, `ffmpeg`, `cloudflared` harus ada di PATH (machine PATH Windows
sudah cukup), kredensial tunnel ada, dan port 9001 bebas.

### 9.5 Runbook

| Gejala | Diagnosis | Tindakan |
| --- | --- | --- |
| Website balas 502/530 | App desktop tidak terbuka / provider mati | Buka `KinoSave` dari Start menu, cek status di jendela |
| `401 API key tidak valid` | Key Vercel ≠ key provider | Samakan via `apiKeyHashes` atau dashboard Vercel |
| `HTTP Error 403` dari YouTube | IP kena throttle | Otomatis retry dengan `player_client=tv_embedded`; tunggu bila tetap gagal |
| `524` saat download | Request origin > 100 detik | Seharusnya tidak terjadi — flow async sudah memisahkannya; kalau muncul, cek apakah `api/status.ts` ter-deploy |
| Port 9001 sudah dipakai | Launcher lama masih jalan | Tutup jendela KinoSave sebelumnya (single-instance lock akan mencegah duplikat) |

---

## 10. Metrik keberhasilan

| Metrik | Target |
| --- | --- |
| Success rate download (job `done`) | > 95% dari job yang lolos validasi |
| Metadata success | > 90% dari link valid |
| Error 524 per hari | 0 |
| Biaya bulanan | Rp 0 |
| Waktu setup pengguna baru | < 1 menit (install + klik shortcut) |
| Durasi rata-rata download 360p | < 3 menit |

---

## 11. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| YouTube memblokir IP | Download gagal massal | Retry `tv_embedded`, backoff, pesan error jujur, ganti jaringan |
| Batas 100 detik Cloudflare | Download besar gagal | Async job + polling (FR-08) |
| Free tier Vercel berakhir | Website mati | Hobby plan sudah cukup; kandidat pindah ke domain statis + worker |
| Komputer mati/offline | Website tidak bisa download | nature of Model A: tetap jalan saat app terbuka; roadmap: hosted worker |
| Key bocor di Git |-API bisa disalahgunakan | `.env*` di-ignore, hash-based rotation, checklist pre-commit |
| Dua instance launcher bentrok port | Provider mati diam-diam | Single-instance lock + deteksi port + error message jelas |

---

## 12. Roadmap

| Prioritas | Item |
| --- | --- |
| P0 | Autostart launcher saat Windows boot (Startup folder / Task Scheduler) |
| P0 | Ikon & signing installer (peringatan "Unknown publisher" saat install) |
| P1 | Auto-update launcher (electron-updater) |
| P1 | Resume/retry otomatis saat job gagal karena throttle |
| P2 | Dukungan MP3 320 kbps + bitrate pilihan |
| P2 | Provider hosted (VPS gratis) sebagai fallback saat PC offline |
| P3 | Batch playlist, subtitle, thumbnail |

---

## 13. Appendix — perintah penting

```powershell
# Development
npm install
npm run dev:all          # Vite + downloader lokal

# Build installer launcher
cd desktop
npm run dist             # output: desktop/dist/KinoSave Setup 0.1.0.exe

# Verifikasi rantai produksi
curl -X POST https://kinosave.han06.web.id/api/info `
  -H "Content-Type: application/json" `
  -d '{"url":"https://www.youtube.com/watch?v=aqz-KE-bpKQ"}'
```

Dokumen terkait: [README.md](./README.md) · [BACKEND_GUIDE.md](./BACKEND_GUIDE.md) ·
[PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md)
