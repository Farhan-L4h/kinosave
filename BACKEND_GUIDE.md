# Backend KinoSave

KinoSave memakai Vercel Function tipis sebagai adapter ke **Cobalt self-hosted**.
Function tidak mengunduh, menyimpan, atau mem-proxy file video; Cobalt yang
memproses media dan mengembalikan URL sementara.

```text
Browser -> Vercel Function /api/download -> Cobalt milik sendiri -> YouTube
```

## Konfigurasi

Salin `.env.example` menjadi `.env.local` untuk pengembangan:

```text
MEDIA_PROVIDER_URL=http://localhost:9000
MEDIA_PROVIDER_API_KEY=
```

Di Vercel, isi `MEDIA_PROVIDER_URL` dengan URL publik Cobalt milik sendiri atau
instance yang memberi izin integrasi. API key hanya disimpan sebagai environment
variable server, bukan di frontend. Jangan commit API key atau cookies.

Request KinoSave:

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "quality": "720",
  "format": "video"
}
```

`quality` menerima `360`, `480`, `720`, `1080`, `1440`, `2160`, atau `max`.
`format` adalah `video` atau `audio`. Audio diproses sebagai MP3.

## Cobalt lokal

File Docker Compose tersedia di `deploy/cobalt/docker-compose.yml`. Dari folder
tersebut jalankan:

```bash
docker compose up -d
curl http://localhost:9000/
```

Jika muncul `ECONNREFUSED`, Cobalt belum berjalan. `npm run dev` tidak dapat
mengunduh video tanpa provider yang aktif.

`API_URL` harus sesuai alamat instance. Untuk pengembangan lokal, gunakan
`http://localhost:9000/`. Pastikan Docker hidup dan port 9000 tidak digunakan
proses lain.

Dokumentasi resmi:
- https://github.com/imputnet/cobalt/blob/current/docs/api.md
- https://github.com/imputnet/cobalt/blob/current/docs/run-an-instance.md

## Menjalankan aplikasi lokal

Project ini sekarang memiliki adapter development-only di `vite.config.ts`, jadi
`npm run dev` sudah meneruskan `/api/download` ke handler yang sama dengan
Vercel Function. Jalankan:

```bash
npm install
npm run dev
```

Setelah server hidup, buka alamat yang ditampilkan CLI dan pastikan
`MEDIA_PROVIDER_URL` di `.env.local` aktif. Untuk fallback yt-dlp lokal, jalankan
service di `deploy/ytdlp/server.mjs` pada port 9001 terlebih dahulu. Alternatifnya, `vercel dev` juga
dapat digunakan tanpa `--prod`, tetapi tidak diperlukan untuk development biasa.
Jangan gunakan instance Cobalt publik tanpa izin.

## Batasan dan legal

- URL hasil Cobalt dapat kedaluwarsa; mulai download segera setelah hasil siap.
- IP datacenter dapat diblokir YouTube. Server rumah atau konfigurasi cookies
  yang sah mungkin diperlukan.
- Gunakan hanya video milik sendiri, berlisensi terbuka, atau yang memang boleh
  disimpan. Mengunduh konten tertentu dapat melanggar Terms of Service dan hak
  cipta.
- Jika Cobalt tidak cocok, gunakan microservice terpisah berbasis yt-dlp dan
  ffmpeg di luar Vercel dengan autentikasi, rate limit, batas durasi, dan folder
  temporary. Jangan menaruh proses download video besar di Vercel Function.

## Alternatif lokal: yt-dlp + ffmpeg

Alternatif ini hanya untuk service lokal/terpisah, bukan untuk Vercel Function.
Install `yt-dlp` dan `ffmpeg` pada mesin service, lalu gunakan selector berikut:

```text
yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 URL
yt-dlp -x --audio-format mp3 URL
```

Service harus membatasi durasi, rate limit, jumlah proses bersamaan, dan menghapus
file temporary setelah download. Jangan mengembalikan path file lokal langsung ke
browser; gunakan URL service yang dilindungi autentikasi.

Contoh menjalankan adapter lokal dari root project:

```powershell
npm run download-server
```

Perintah tersebut sama dengan `node deploy\ytdlp\server.mjs`; jangan menjalankan
`node server.mjs` dari root karena file tidak berada di sana. Untuk menjalankan
service downloader dan Vite sekaligus:

```powershell
npm run dev:all
```

Install dependency Windows (PowerShell Administrator):

```powershell
choco install yt-dlp ffmpeg -y
```
