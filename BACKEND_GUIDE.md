# 🚀 Panduan Membuat Backend untuk KinoSave

## Kenapa Y2mate Bisa Berfungsi?

Website seperti Y2mate, SaveFrom, atau sejenisnya memiliki **backend server** yang memproses video. Aplikasi KinoSave saat ini hanya **frontend (UI)** dan berjalan dalam **mode demo**.

## Arsitektur yang Dibutuhkan

```
┌─────────────┐      HTTP Request       ┌─────────────┐
│   Frontend  │ ──────────────────────> │   Backend   │
│  (React UI) │                         │   Server    │
└─────────────┘                         └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  yt-dlp /   │
                                        │ youtube-dl  │
                                        │   Library   │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Download   │
                                        │    Video    │
                                        └─────────────┘
```

## Pilihan Teknologi Backend

### 1. **Node.js + Express** (Recommended)

**Install dependencies:**
```bash
npm install express ytdl-core cors
```

**Contoh kode `server.js`:**
```javascript
const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/download', async (req, res) => {
  try {
    const { url, type } = req.body;
    
    // Validasi URL YouTube
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'URL YouTube tidak valid' });
    }
    
    // Ambil info video
    const info = await ytdl.getInfo(url);
    const format = type === 'audio' 
      ? ytdl.chooseFormat(info.formats, { quality: 'highestaudio' })
      : ytdl.chooseFormat(info.formats, { quality: 'highest' });
    
    res.json({
      downloadUrl: format.url,
      filename: `${info.videoDetails.title}.${type === 'audio' ? 'mp3' : 'mp4'}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
```

**Jalankan:**
```bash
node server.js
```

**Update Vite config untuk proxy:**
```javascript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
```

---

### 2. **Python + Flask**

**Install dependencies:**
```bash
pip install flask flask-cors yt-dlp
```

**Contoh kode `app.py`:**
```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app)

@app.route('/api/download', methods=['POST'])
def download_video():
    data = request.json
    url = data.get('url')
    download_type = data.get('type', 'video')
    
    try:
        ydl_opts = {
            'format': 'bestaudio/best' if download_type == 'audio' else 'best',
            'quiet': True
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            download_url = info['url']
            filename = f"{info['title']}.{'mp3' if download_type == 'audio' else 'mp4'}"
            
        return jsonify({
            'downloadUrl': download_url,
            'filename': filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=3001, debug=True)
```

**Jalankan:**
```bash
python app.py
```

---

### 3. **Menggunakan API Pihak Ketiga**

Beberapa API yang bisa digunakan:
- **RapidAPI YouTube Downloader**
- **YouTube Data API v3** (official, tapi tidak untuk download langsung)
- **Cobalt API** (open source)
- **y2mate API** (reverse engineered - tidak resmi)

**Contoh dengan RapidAPI:**
```javascript
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  
  const response = await fetch('https://youtube-mp36.p.rapidapi.com/dl', {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': 'YOUR_API_KEY',
      'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
    }
  });
  
  const data = await response.json();
  res.json(data);
});
```

---

## Deploy Backend ke Cloud

### **Vercel** (untuk Node.js)
```bash
npm install -g vercel
vercel
```

### **Railway** (untuk Python/Node.js)
```bash
# Push ke GitHub, lalu connect di railway.app
```

### **Heroku** (untuk semua)
```bash
heroku create kinosave-api
git push heroku main
```

### **DigitalOcean / AWS / Google Cloud**
- Deploy sebagai Docker container
- Gunakan PM2 untuk Node.js
- Gunakan Gunicorn untuk Python

---

## Pertimbangan Legal & Etika

⚠️ **PENTING:**
- Mengunduh video yang memiliki hak cipta tanpa izin adalah **ILEGAL** di banyak negara
- YouTube Terms of Service **melarang** download video tanpa izin
- Gunakan hanya untuk:
  - Video yang Anda miliki
  - Video dengan lisensi Creative Commons
  - Tujuan edukasi/pembelajaran pribadi
  - Konten yang Anda buat sendiri

---

## Alternatif: Ubah Mode Demo ke Production

Untuk sementara, ubah `demoMode` menjadi `false` di `Conten.tsx`:

```typescript
const [demoMode] = useState(false); // Ubah jadi false setelah backend ready
```

Lalu pastikan backend Anda sudah jalan di `http://localhost:3001` atau update endpoint-nya.

---

## Resources

- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [ytdl-core npm](https://www.npmjs.com/package/ytdl-core)
- [YouTube API](https://developers.google.com/youtube/v3)
- [Flask CORS](https://flask-cors.readthedocs.io/)

---

**Made with ❤️ for KinoSave**
