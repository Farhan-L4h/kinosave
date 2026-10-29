# AI_TASK: Perbaiki Fitur Download YouTube di KinoSave

> Dokumen ini adalah konteks + instruksi kerja untuk AI coding assistant.
> Baca seluruhnya sebelum mengubah kode. Jangan berasumsi tentang isi `api/download.ts`; **baca dulu file aslinya**.

---

## 1. Konteks Proyek

- Repo: https://github.com/Farhan-L4h/kinosave
- Stack: React + TypeScript + Vite (frontend), Vercel Function di folder `api/` (backend tipis)
- Deploy: Vercel (`kinosave.vercel.app`)
- Frontend sudah jadi. **Yang rusak hanya proses download video YouTube.**
- Struktur yang diketahui: `api/`, `src/`, `public/`, `.env.example`, `BACKEND_GUIDE.md`, `PROJECT_ANALYSIS.md`
- Arsitektur saat ini (menurut `BACKEND_GUIDE.md`):
  - `POST /api/download` dengan body `{ "url": "...", "format": "video" }`
  - Function memvalidasi URL, lalu meneruskan ke provider downloader lewat env var:
    - `MEDIA_PROVIDER_URL`
    - `MEDIA_PROVIDER_API_KEY` (opsional)
  - Provider diharapkan mengikuti kontrak **Cobalt API** (`POST /`, response `status` = `redirect` / `tunnel`, field `url` dan `filename`)
  - Response dinormalisasi menjadi `{ downloadUrl, filename }`
  - Function tidak menyimpan file dan tidak mem-proxy file besar

## 2. Masalah

Download video YouTube tidak berhasil, dan belum ada pilihan resolusi.

## 3. Kemungkinan Penyebab (verifikasi satu per satu, jangan menebak)

| # | Dugaan | Cara cek |
|---|--------|----------|
| 1 | `MEDIA_PROVIDER_URL` belum diisi / salah di Vercel | Cek `.env.example`, `process.env` di function, log Vercel |
| 2 | Provider Cobalt publik menolak request (401/403) karena butuh autentikasi atau memblokir pihak ketiga | Log status code + body error dari provider |
| 3 | YouTube memblokir IP datacenter (error seperti `youtube.login`, `youtube.no_matching_format`, "Sign in to confirm you're not a bot") | Log `error.code` dari response Cobalt |
| 4 | Request body tidak sesuai kontrak Cobalt (header `Accept`/`Content-Type`, field `url`) | Bandingkan dengan docs Cobalt |
| 5 | Frontend masih `demoMode` / endpoint salah | Cek `Conten.tsx` (atau komponen konten), cari `demoMode` |
| 6 | Batas Vercel: ukuran response function terbatas (sekitar 4.5 MB), timeout, tidak ada ffmpeg | Lihat docs limit Vercel terbaru |

Kesimpulan penting: **Vercel tidak cocok untuk memproses/mengunduh video secara langsung.** Vercel cukup untuk frontend + function tipis yang meneruskan request ke backend downloader yang berjalan di tempat lain.

## 4. Solusi yang Dipilih

### Opsi A (UTAMA): Self-host Cobalt

Cobalt adalah downloader open source (lisensi AGPL-3.0), gratis, ringan, mendukung pilihan kualitas video, dan **kontraknya sudah cocok dengan `api/download.ts` yang ada**, jadi perubahan kode minimal.

```
[Browser] -> [Vercel: React + api/download.ts] -> [Server Cobalt milik sendiri] -> YouTube
```

Docs resmi (ikuti versi terbaru, jangan hafalan):
- API: https://github.com/imputnet/cobalt/blob/current/docs/api.md
- Menjalankan instance: https://github.com/imputnet/cobalt/blob/current/docs/run-an-instance.md

Contoh `docker-compose.yml` untuk server Cobalt (cek tag image & env var di docs terbaru):

```yaml
services:
  cobalt:
    image: ghcr.io/imputnet/cobalt:11
    init: true
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      API_URL: "https://cobalt.domainkamu.com/"   # URL publik instance
      API_AUTH_REQUIRED: "1"                      # wajib auth, agar tidak dipakai orang lain
      # COOKIE_PATH: "/cookies.json"              # opsional, untuk mengurangi blokir YouTube
    # volumes:
    #   - ./cookies.json:/cookies.json:ro
```

Catatan hosting gratis:
- Server Cobalt **tidak bisa** di Vercel. Pilihan: VPS gratis/murah, Railway/Render/Fly.io (cek batas free tier terbaru), atau PC/laptop/Raspberry Pi di rumah + Cloudflare Tunnel.
- IP datacenter sering diblokir YouTube. IP rumahan (via Cloudflare Tunnel) biasanya paling stabil. Jika perlu cookies, pakai **akun YouTube cadangan**, bukan akun utama.
- Jangan memakai instance publik orang lain tanpa izin.

### Opsi B (CADANGAN): Microservice sendiri dengan yt-dlp + ffmpeg

Dipakai jika Cobalt tidak cocok. Buat service kecil terpisah (FastAPI atau Express) dalam Docker, **bukan di Vercel**.

Spesifikasi:
- Image: Python slim + `yt-dlp` + `ffmpeg`
- `GET /info?url=` mengembalikan judul, thumbnail, durasi, dan daftar resolusi yang tersedia
- `GET /download?url=&height=720&type=video|audio` mengunduh ke folder temp, lalu stream file ke client, lalu hapus file temp
- Format selector yt-dlp, contoh: `bestvideo[height<=720]+bestaudio/best[height<=720]` dengan `--merge-output-format mp4`
- Audio: `-x --audio-format mp3`
- Batasi durasi maksimum (mis. 30 menit), jumlah request bersamaan, dan rate limit per IP
- Wajib header `X-API-Key` yang dicek terhadap env var, supaya tidak bisa dipakai bebas

## 5. Tugas yang Harus Dikerjakan

### Langkah 0 - Audit (WAJIB, sebelum mengubah apa pun)
1. Baca `api/download.ts`, `.env.example`, `vite.config.ts`, `package.json`, dan komponen frontend yang memanggil `/api/download` (cari `fetch('/api/download'`, `demoMode`).
2. Tulis ringkasan singkat: apa yang dilakukan kode sekarang, dan penyebab paling mungkin dari kegagalan (dari tabel di bagian 3).

### Langkah 1 - Perbaiki `api/download.ts`
- Terima body: `{ url: string, quality?: "144"|"240"|"360"|"480"|"720"|"1080"|"1440"|"2160"|"max", format?: "video"|"audio" }`
- Validasi URL dengan allowlist host: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`. Tolak selain itu (cegah SSRF). Parse dengan `new URL()`, jangan regex longgar.
- Request ke provider (kontrak Cobalt):
  ```ts
  const res = await fetch(process.env.MEDIA_PROVIDER_URL!, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(process.env.MEDIA_PROVIDER_API_KEY
        ? { Authorization: `Api-Key ${process.env.MEDIA_PROVIDER_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      url,
      videoQuality: quality ?? "720",
      downloadMode: format === "audio" ? "audio" : "auto",
      audioFormat: "mp3",
      filenameStyle: "basic",
      youtubeVideoCodec: "h264",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  ```
  (Cek ulang nama field di docs Cobalt versi yang dipakai.)
- Tangani semua nilai `status`: `tunnel`, `redirect`, `picker` (pilih item pertama atau kembalikan daftar), `error` (teruskan `error.code` sebagai pesan yang ramah), dan `local-processing` (jika muncul, beri pesan jelas bahwa belum didukung, atau tangani sesuai docs).
- Normalisasi response menjadi `{ downloadUrl, filename }`.
- Error handling: timeout, provider mati, env var kosong -> status code dan pesan yang jelas dalam Bahasa Indonesia. Log detail di server saja, jangan bocorkan API key atau URL internal ke client.
- Hanya terima `POST`; tambahkan rate limit sederhana jika memungkinkan.

### Langkah 2 - Update Frontend
- Hapus/nonaktifkan `demoMode` sehingga memakai API sungguhan.
- Tambahkan **dropdown/pilihan resolusi**: 360p, 480p, 720p, 1080p, 1440p, 2160p, plus opsi "Audio (MP3)". Default 720p.
- Kirim `quality` dan `format` ke `/api/download`.
- Tampilkan state: loading, sukses, error (pesan dari server).
- Untuk memulai download, pakai `window.location.href = downloadUrl` atau `<a href download>` (atribut `download` diabaikan untuk URL lintas-origin, jadi jangan bergantung padanya).
- Jaga gaya UI yang sudah ada; jangan redesign.

### Langkah 3 - Konfigurasi & Dokumentasi
- Update `.env.example`:
  ```
  MEDIA_PROVIDER_URL=https://cobalt.domainkamu.com
  MEDIA_PROVIDER_API_KEY=isi_api_key_cobalt
  ```
- Update `BACKEND_GUIDE.md`: hapus bagian lama yang menyarankan `ytdl-core` (usang/sering rusak), ganti dengan panduan Opsi A (dan Opsi B singkat).
- Tambahkan `docker-compose.yml` untuk Cobalt di folder terpisah (mis. `deploy/cobalt/`), **bukan** di root yang di-deploy Vercel.
- Tambahkan langkah setup: isi env var di Vercel -> Redeploy.

### Langkah 4 - Pengujian (laporkan hasilnya)
- [ ] Video pendek publik, 360p: berhasil
- [ ] Video yang sama, 1080p: berhasil dan suara ada (video+audio tergabung)
- [ ] Mode audio MP3: berhasil
- [ ] URL bukan YouTube: ditolak dengan pesan jelas
- [ ] `MEDIA_PROVIDER_URL` kosong: pesan error jelas, tidak crash
- [ ] Provider mati/timeout: pesan error jelas
- [ ] `npm run build` dan `npm run lint` lolos tanpa error TypeScript

## 6. Batasan & Larangan

- JANGAN memakai `ytdl-core` lama (tidak lagi dirawat dan sering gagal). Kalau tetap perlu library Node, gunakan fork yang masih aktif dan jelaskan risikonya.
- JANGAN mem-proxy/stream file video lewat Vercel Function (batas ukuran response dan timeout).
- JANGAN commit API key/cookies; simpan di env var dan pastikan masuk `.gitignore`.
- JANGAN memakai instance Cobalt publik milik orang lain tanpa izin.
- JANGAN mengubah hal di luar cakupan (styling, struktur halaman) kecuali diperlukan.
- Jelaskan jujur jika ada bagian yang tidak bisa diverifikasi (mis. server Cobalt belum aktif, jadi tes end-to-end belum bisa dijalankan).

## 7. Catatan Legal

Mengunduh video bisa melanggar Terms of Service YouTube dan hak cipta. Tambahkan disclaimer singkat di UI/README: hanya untuk konten milik sendiri, berlisensi terbuka, atau yang memang boleh disimpan.

## 8. Format Laporan Akhir dari AI

1. Penyebab masalah (hasil audit)
2. Daftar file yang diubah/ditambah + alasan singkat
3. Langkah yang harus saya lakukan secara manual (setup server Cobalt, isi env di Vercel, redeploy)
4. Hasil pengujian (checklist di atas)
5. Risiko/batasan yang masih ada
