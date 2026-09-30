# Analisis Pengembangan KinoSave

## 1. Ringkasan kebutuhan

KinoSave akan menjadi mini web ringan untuk membantu pengguna memasukkan satu link media dari:

- YouTube
- TikTok
- Instagram

Alur utama yang diinginkan:

1. Pengguna menempelkan link.
2. Sistem memvalidasi dan mengenali platform.
3. Sistem memproses link.
4. Pengguna mendapatkan pilihan atau link unduhan.
5. Link yang pernah diproses tampil di riwayat.

Preferensi produk:

- UI sederhana dengan modal atau panel input link sebagai fokus utama.
- Gaya visual Neo-Brutalism yang tegas dan ekspresif.
- Default dark mode.
- Ringan dan cepat.
- Bisa dideploy ke Vercel.
- Tidak menambahkan server terpisah.

Dokumen ini hanya berisi analisis dan rencana teknis. Belum ada implementasi fitur pada tahap ini.

## 2. Audit kondisi proyek saat ini

### Stack yang sudah tersedia

- React 19
- TypeScript
- Vite
- Tailwind CSS v4 melalui `@tailwindcss/vite`
- ESLint
- Konfigurasi build yang sudah cocok untuk static deployment

### Kondisi aplikasi saat ini

- Entry point utama berada di `src/App.tsx`.
- UI utama berada di `src/Conten.tsx`.
- Aplikasi masih berjalan dalam `demoMode`.
- Submit saat ini membuat link unduhan palsu setelah jeda simulasi.
- Endpoint produksi yang direncanakan adalah `POST /api/download`.
- Riwayat disimpan di cookie `kinosave_history`, maksimal 20 item.
- `src/index.css` sudah memuat Tailwind dan style scrollbar.
- `index.html` masih memakai favicon Vite dan memuat Font Awesome dari CDN.
- `BACKEND_GUIDE.md` sudah menjelaskan beberapa opsi backend, tetapi belum sesuai sepenuhnya dengan batasan Vercel-only.

### Kesimpulan audit

Basis frontend sudah cukup untuk dikembangkan tanpa migrasi framework. Vite + React dapat dideploy sebagai static site ke Vercel. Namun, fitur download nyata belum tersedia karena membutuhkan pemrosesan media di sisi server atau layanan pemroses eksternal.

## 3. Batasan teknis paling penting

### Vercel bukan media downloader penuh

Vercel Functions cocok untuk:

- Validasi URL.
- Routing API.
- Memanggil API pihak ketiga.
- Mengembalikan metadata atau URL hasil proses.
- Menyimpan data ringan melalui layanan database yang kompatibel.

Vercel Functions tidak ideal untuk:

- Menjalankan proses `yt-dlp` atau binary downloader secara stabil.
- Menjalankan FFmpeg dengan durasi panjang.
- Menyimpan file video besar di filesystem lokal.
- Menjadi proxy streaming video tanpa batas waktu dan batas ukuran.
- Menjamin URL media dari platform selalu aktif atau tidak kedaluwarsa.

Filesystem runtime serverless bersifat sementara. Karena itu, model "download media langsung hanya dari Vercel tanpa layanan lain" tidak dapat dianggap sebagai arsitektur produksi yang reliable.

### Opsi implementasi yang realistis

#### Opsi A: Vercel + API pemroses pihak ketiga

Frontend memanggil endpoint serverless Vercel. Endpoint tersebut:

1. Memvalidasi URL dan platform.
2. Mengirim permintaan ke provider downloader.
3. Menormalisasi respons provider.
4. Mengembalikan metadata dan URL hasil.

Kelebihan:

- Tidak perlu server tambahan yang dikelola sendiri.
- Cocok dengan target deploy Vercel.
- Implementasi relatif cepat.

Kekurangan:

- Bergantung pada ketersediaan, harga, rate limit, dan kebijakan provider.
- API key wajib disimpan sebagai environment variable Vercel.
- Provider dapat berubah atau berhenti berfungsi.
- Perlu pemeriksaan legal dan Terms of Service provider.

#### Opsi B: Vercel + worker atau service pemroses terpisah

Vercel menangani UI dan API gateway, sedangkan worker khusus menangani pengambilan media dan konversi.

Kelebihan:

- Lebih fleksibel untuk proses panjang dan file besar.
- Kontrol lebih besar atas format dan retry.

Kekurangan:

- Tidak memenuhi interpretasi ketat "tanpa tambahan lain".
- Ada biaya dan deployment tambahan.
- Membutuhkan monitoring dan pemeliharaan lebih banyak.

#### Opsi C: Frontend demo atau metadata-only

Aplikasi hanya memvalidasi URL, menyimpan riwayat, dan menampilkan instruksi atau tautan resmi. Tidak ada pengambilan file oleh aplikasi.

Kelebihan:

- Benar-benar hanya membutuhkan deployment static Vercel.
- Sangat ringan dan minim risiko operasional.

Kekurangan:

- Tidak memenuhi kebutuhan download langsung.

### Rekomendasi

Untuk target "langsung jalan di Vercel" tanpa mengelola server sendiri, gunakan Opsi A dengan provider yang jelas API-nya, legalitasnya ditinjau, dan memiliki batas penggunaan yang dapat dikendalikan. Jangan menaruh API key di frontend.

Sebelum implementasi produksi, perlu keputusan eksplisit provider atau keputusan bahwa fase pertama hanya berupa UI dan mode demo.

## 4. Rancangan arsitektur yang disarankan

```text
Browser
  |
  | POST /api/download
  v
Vercel Function
  |-- validasi URL dan platform
  |-- rate limit / abuse guard
  |-- panggil provider dengan secret env
  v
Provider pemroses media
  |
  v
Respons metadata + URL hasil
```

### Endpoint yang direncanakan

`POST /api/download`

Request minimum:

```json
{
  "url": "https://...",
  "format": "video"
}
```

Respons berhasil:

```json
{
  "platform": "youtube",
  "title": "Judul media",
  "downloadUrl": "https://...",
  "filename": "judul-media.mp4",
  "expiresAt": "2026-09-30T18:00:00.000Z"
}
```

Respons gagal perlu memiliki pesan yang aman dan dapat ditampilkan pengguna, misalnya:

- URL tidak valid.
- Platform belum didukung.
- Media tidak tersedia.
- Provider sedang sibuk.
- Batas penggunaan tercapai.

Jangan mengembalikan stack trace, API key, atau detail internal provider ke browser.

### Validasi platform

Validasi awal sebaiknya hanya mengizinkan hostname yang memang didukung, termasuk variasi resmi yang diperlukan:

- YouTube dan domain pendek resminya.
- TikTok.
- Instagram.

Validasi hostname lebih aman daripada hanya memeriksa apakah string dimulai dengan `http`. Redirect, URL tracking, dan domain tiruan perlu ditangani dengan hati-hati.

## 5. Strategi riwayat link

### Fase pertama: `localStorage`

Untuk kebutuhan "link apa saja yang pernah kita download", `localStorage` paling sesuai jika riwayat hanya untuk browser/perangkat pengguna.

Data yang disimpan:

```ts
interface HistoryEntry {
  id: string
  url: string
  platform: 'youtube' | 'tiktok' | 'instagram'
  format: 'video' | 'audio'
  title?: string
  createdAt: string
  status: 'completed' | 'failed'
}
```

Aturan yang disarankan:

- Simpan maksimal 20-30 entri.
- Deduplicate berdasarkan URL normalisasi dan format.
- Entri terbaru muncul paling atas.
- Sediakan aksi gunakan ulang, salin link, dan hapus semua.
- Jika parsing `localStorage` gagal, tampilkan state kosong dan log error secara aman.
- Jangan menyimpan API response mentah atau token provider.

Cookie yang dipakai sekarang dapat diganti karena cookie tidak diperlukan untuk state lokal ini dan ukurannya lebih terbatas.

### Jika riwayat harus lintas perangkat

Maka dibutuhkan autentikasi dan database eksternal. Itu bukan lagi fitur lokal sederhana dan bertentangan dengan target tanpa tambahan layanan. Keputusan ini sebaiknya ditunda sampai kebutuhan produk benar-benar ada.

## 6. Rancangan UX

### Struktur halaman

1. Header ringkas dengan wordmark KinoSave dan status "Dark by default".
2. Hero utama dengan copy singkat.
3. Panel input link sebagai fokus utama.
4. Pilihan format hanya ditampilkan jika provider memang mendukungnya.
5. State loading yang jelas.
6. Hasil unduhan dengan judul, platform, masa berlaku link, dan tombol download.
7. Riwayat lokal.
8. Catatan penggunaan dan hak cipta.

### Model modal

Modal cocok untuk alur cepat dari tombol "Paste link". Namun, input utama tetap sebaiknya terlihat pada desktop agar fungsi inti dapat dipahami tanpa klik tambahan. Pada mobile, modal bottom sheet dapat digunakan agar keyboard dan tombol submit tetap mudah dijangkau.

### State wajib

- Empty: belum ada link.
- Invalid URL: URL tidak sesuai.
- Unsupported platform: platform belum didukung.
- Loading: sedang mengambil metadata.
- Success: hasil tersedia.
- Expired: URL hasil sudah kedaluwarsa.
- Provider error: provider gagal atau rate limit.
- History empty: belum ada riwayat.
- History populated: daftar riwayat dengan aksi.
- Clipboard unavailable: fallback paste manual atau pesan yang jelas.

## 7. Arah visual Neo-Brutalism

**Design Read:** utility downloader untuk pengguna umum, dengan bahasa Neo-Brutalist yang gelap, kontras, tegas, dan sedikit playful tanpa dekorasi yang mengganggu tugas utama.

### Dial desain

- `DESIGN_VARIANCE: 7/10`: layout asimetris ringan dan panel yang tidak terlalu simetris.
- `MOTION_INTENSITY: 3/10`: hanya feedback tombol, modal, dan state loading; tidak memakai animasi berat.
- `VISUAL_DENSITY: 4/10`: cukup lega untuk fokus pada satu input dan daftar riwayat.

### Token visual awal

- Tema tunggal: dark mode default.
- Latar: off-black atau charcoal, bukan hitam murni.
- Surface: charcoal yang sedikit lebih terang dari latar.
- Accent: satu warna utama, disarankan acid green atau electric orange. Pilih satu dan gunakan konsisten.
- Border: 2-3px solid dengan kontras tinggi.
- Radius: dominan 0-8px, konsisten di seluruh interface.
- Shadow: offset hard shadow khas Neo-Brutalism, digunakan terbatas pada panel dan tombol penting.
- Typography: sans display tebal untuk heading dan sans/mono sederhana untuk metadata.
- Hindari gradient, glassmorphism, glow, dan dekorasi yang tidak membantu tugas.

### Prinsip responsive

- Desktop: panel input besar dengan history di bawah atau di sisi yang lebih sempit.
- Mobile: satu kolom, input dan tombol full width.
- Tombol utama tetap satu baris dan mudah disentuh.
- Focus ring harus terlihat jelas.
- Kontras teks dan tombol harus memenuhi WCAG AA.

## 8. Performance dan deployment

### Target

- Static asset sekecil mungkin.
- Tidak menambahkan library ikon atau animasi jika tidak diperlukan.
- Hindari Font Awesome CDN bila ikon sederhana dapat diganti teks atau CSS yang sudah ada.
- Lazy-load bagian non-esensial jika nanti bertambah.
- Pastikan hasil build Vite dapat dilayani oleh Vercel.

### Konfigurasi Vercel

Untuk frontend Vite, konfigurasi deploy dapat menggunakan:

- Build command: `npm run build`
- Output directory: `dist`
- Install command default dari `package-lock.json`

Jika endpoint serverless ditambahkan, perlu dipilih struktur API Vercel yang kompatibel dengan konfigurasi proyek. Endpoint harus diuji secara lokal dan di preview deployment sebelum production.

Environment variable yang mungkin diperlukan:

```text
MEDIA_PROVIDER_URL
MEDIA_PROVIDER_API_KEY
```

Nilai rahasia hanya boleh berada di environment Vercel dan tidak boleh diberi awalan yang mengeksposnya ke client bundle.

## 9. Legal, keamanan, dan abuse prevention

Implementasi downloader harus digunakan hanya untuk konten yang pengguna berhak simpan atau yang memang diizinkan oleh pemilik dan platform. Syarat layanan YouTube, TikTok, Instagram, lisensi konten, dan aturan wilayah perlu ditinjau sebelum fitur produksi diaktifkan.

Pengamanan minimum:

- Validasi hostname dan skema `https`.
- Rate limiting per IP atau identifier yang sesuai.
- Batas ukuran request.
- Timeout provider.
- Jangan menerima URL arbitrary untuk proxy terbuka.
- Jangan mengekspos provider credential.
- Jangan menyimpan media di filesystem serverless.
- Sanitasi nama file dari metadata provider.
- Logging error tanpa URL sensitif berlebihan.
- Tampilkan disclaimer yang mudah dipahami, bukan sebagai pengganti pemeriksaan legal.

## 10. Rencana pengerjaan bertahap

### Fase 0: keputusan produk

- Tentukan apakah fase pertama demo atau download nyata.
- Jika nyata, pilih dan setujui provider.
- Tentukan apakah format audio diperlukan.
- Tentukan batas riwayat lokal.

### Fase 1: redesign frontend

- Rapikan komponen halaman.
- Terapkan Neo-Brutalism dark mode.
- Buat input link, modal, history, dan semua state UX.
- Ganti cookie history dengan `localStorage`.
- Hapus ketergantungan UI yang tidak diperlukan.

### Fase 2: integrasi Vercel Function

- Tambahkan endpoint `/api/download`.
- Validasi input di server.
- Integrasikan provider melalui environment variable.
- Normalisasi respons dan error.
- Tambahkan timeout dan rate limit.

### Fase 3: verifikasi deployment

- Jalankan lint dan build.
- Uji URL untuk tiga platform.
- Uji URL invalid, provider error, dan expired link.
- Uji mobile keyboard, modal, clipboard, dan riwayat.
- Uji preview Vercel dengan secret yang benar.
- Pastikan API key tidak masuk ke bundle frontend.

## 11. Kriteria penerimaan sebelum implementasi dianggap selesai

- Pengguna dapat menempelkan URL YouTube, TikTok, dan Instagram yang valid.
- Platform terdeteksi dan platform yang tidak didukung ditolak dengan jelas.
- Loading, success, error, dan empty state tersedia.
- Riwayat tersimpan setelah pemrosesan dan tetap ada setelah refresh.
- Riwayat dapat digunakan ulang, disalin, dan dibersihkan.
- UI default dark mode dan konsisten dalam satu tema.
- Tampilan Neo-Brutalist responsif pada desktop dan mobile.
- Tidak ada API key di client.
- Tidak ada proses downloader berat yang dijalankan secara tidak aman di Vercel Function.
- Build dan deployment Vercel berhasil.
- Disclaimer hak cipta terlihat pada lokasi yang wajar.

## 12. Keputusan yang diperlukan sebelum implementasi

1. Apakah ingin langsung download nyata melalui API provider, atau mulai dari UI/demo?
2. Jika download nyata, provider/API mana yang akan digunakan?
3. Apakah format audio tetap diperlukan, atau cukup video?
4. Apakah riwayat cukup tersimpan di browser ini, atau harus lintas perangkat?
5. Accent Neo-Brutalism yang dipilih: acid green atau electric orange?

