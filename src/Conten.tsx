import { useEffect, useState } from "react";

// KinoSave - Single page React component
// Notes for integrator:
// 1) Add Font Awesome in your index.html (recommended):
//    <script src="https://kit.fontawesome.com/xxxxxx.js" crossorigin="anonymous"></script>
// 2) This component expects a backend POST /api/download that accepts { url, type }
//    and returns JSON { downloadUrl, filename } (or an error message).
// 3) If backend is not available, the UI will operate in demo mode and generate placeholder links.
// 4) This file uses plain CSS utility classes compatible with Tailwind. If you don't use Tailwind,
//    replace classes or add a small CSS file.

const COOKIE_NAME = "kinosave_history";
const COOKIE_EXPIRE_DAYS = 365;

interface HistoryEntry {
  url: string;
  type: string;
  createdAt: string;
}

interface DownloadResult {
  downloadUrl: string;
  filename: string;
}

// Simple cookie helpers (no external libs)
function setCookie(name: string, value: string, days: number): void {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name: string): string | undefined {
  const matches = document.cookie.match(new RegExp(
    `(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1")}=([^;]*)`
  ));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

function addToHistory(entry: HistoryEntry): HistoryEntry[] {
  try {
    const raw = getCookie(COOKIE_NAME);
    const list: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    // prevent duplicates by URL + type
    const exists = list.find((i) => i.url === entry.url && i.type === entry.type);
    if (!exists) {
      list.unshift(entry);
      // keep max 20
      const trimmed = list.slice(0, 20);
      setCookie(COOKIE_NAME, JSON.stringify(trimmed), COOKIE_EXPIRE_DAYS);
      return trimmed;
    }
    return list;
  } catch (e) {
    console.error("cookie parse error", e);
    setCookie(COOKIE_NAME, JSON.stringify([entry]), COOKIE_EXPIRE_DAYS);
    return [entry];
  }
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = getCookie(COOKIE_NAME);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export default function KinoSave() {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"video" | "audio">("video"); // video or audio
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dark] = useState(true); // Always dark mode
  const [demoMode] = useState(true); // Demo mode enabled - no backend needed

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  function validateUrl(u: string): boolean {
    try {
      const parsed = new URL(u);
      // basic check: has hostname
      return !!parsed.hostname;
    } catch (e) {
      return false;
    }
  }

  async function handleSubmit(e?: React.FormEvent): Promise<void> {
    e && e.preventDefault();
    setError(null);
    setResult(null);

    if (!url.trim()) {
      setError("Masukkan URL terlebih dahulu");
      return;
    }
    if (!validateUrl(url)) {
      setError("URL tidak valid");
      return;
    }

    setLoading(true);

    // Save to history immediately
    const histEntry: HistoryEntry = { url: url.trim(), type, createdAt: new Date().toISOString() };
    setHistory(() => {
      const newH = addToHistory(histEntry);
      return newH;
    });

    try {
      if (demoMode) {
        // Simulate result in demo mode
        await new Promise((r) => setTimeout(r, 1200));
        
        // Extract video ID from YouTube URL for demo purposes
        let videoId = "demo";
        try {
          const urlObj = new URL(url);
          videoId = urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop() || "demo";
        } catch (e) {
          // Use URL hash if can't parse
          videoId = url.substring(url.length - 8);
        }
        
        const fake: DownloadResult = {
          downloadUrl: `https://demo.kinosave.com/download/${videoId}.${type === 'audio' ? 'mp3' : 'mp4'}`,
          filename: `kinosave-${videoId}-${type}.${type === 'audio' ? 'mp3' : 'mp4'}`,
        };
        setResult(fake);
        setLoading(false);
        return;
      }

      // call backend
      const resp = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), type }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Gagal menghubungi server");
      }

      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (!data.downloadUrl) throw new Error("Server tidak mengembalikan downloadUrl");

      setResult({ downloadUrl: data.downloadUrl, filename: data.filename || "download" });
    } catch (err) {
      setError((err as Error).message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string): void {
    navigator.clipboard && navigator.clipboard.writeText(text);
  }

  function useHistoryItem(item: HistoryEntry): void {
    setUrl(item.url);
    setType(item.type as "video" | "audio");
    // auto submit
    setTimeout(() => handleSubmit(), 60);
  }

  function clearHistory(): void {
    setCookie(COOKIE_NAME, JSON.stringify([]), COOKIE_EXPIRE_DAYS);
    setHistory([]);
  }

  return (
    <div className="min-h-screen bg-[#1a1f2e] p-6 flex items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="bg-[#242b3d] rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                KS
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">KinoSave</h1>
                <p className="text-sm text-gray-400">Download Video / Audio dari YouTube, IG, Facebook dan lainnya</p>
              </div>
            </div>
            <button
              className="p-3 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors"
              aria-label="Settings"
            >
              <i className="fas fa-cog text-xl"></i>
            </button>
          </header>

          {/* Main Form */}
          <main>
            {demoMode && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-yellow-200 text-xs flex items-start gap-2">
                <i className="fas fa-info-circle mt-0.5"></i>
                <span>
                  <strong>Mode Demo:</strong> Aplikasi ini berjalan dalam mode demo. Link download yang dihasilkan adalah contoh saja. 
                  Untuk implementasi sesungguhnya, diperlukan backend server untuk memproses video.
                </span>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-white mb-2">
                Masukkan link (YouTube / Facebook / Instagram / dll)
              </label>
              
              <div className="flex gap-3 flex-wrap sm:flex-nowrap">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=NhgO1f67BJA&list=PLi4K"
                  className="flex-1 min-w-0 rounded-lg border border-gray-600 bg-[#1a1f2e] p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value as "video" | "audio")} 
                  className="rounded-lg border border-gray-600 bg-[#1a1f2e] px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="video">Video (mp4)</option>
                  <option value="audio">Audio (mp3)</option>
                </select>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/50"
                >
                  {loading ? "Memproses..." : "Download"}
                </button>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-red-900/30 border border-red-500/50 text-red-300 text-sm">
                  <i className="fas fa-exclamation-circle mr-2"></i>
                  {error}
                </div>
              )}

              {result && (
                <div className="p-4 rounded-lg bg-green-900/30 border border-green-500/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-green-300 mb-1">
                        <i className="fas fa-check-circle mr-2"></i>
                        Berhasil diproses
                      </div>
                      <div className="text-xs text-gray-400">{result.filename || "file"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                        href={result.downloadUrl} 
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium"
                        target="_blank" 
                        rel="noreferrer"
                      >
                        <i className="fas fa-download mr-2"></i>
                        Download
                      </a>
                      <button 
                        onClick={() => copyToClipboard(result.downloadUrl)} 
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400"
                        title="Salin link"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* History Section */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Riwayat</h3>
                {history.length > 0 && (
                  <button 
                    onClick={clearHistory} 
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                  >
                    Bersihkan
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="fas fa-history text-3xl mb-2 opacity-50"></i>
                    <p className="text-sm">Belum ada riwayat download</p>
                  </div>
                ) : (
                  history.map((h, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-4 rounded-lg bg-[#1a1f2e] hover:bg-[#1e2433] transition-colors border border-gray-700/50"
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="text-sm font-medium text-white truncate mb-1">
                          {h.url}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-3">
                          <span className="inline-flex items-center">
                            <i className={`fas ${h.type === 'video' ? 'fa-video' : 'fa-music'} mr-1`}></i>
                            {h.type}
                          </span>
                          <span>
                            <i className="far fa-clock mr-1"></i>
                            {new Date(h.createdAt).toLocaleString('id-ID', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          title="Gunakan lagi" 
                          onClick={() => useHistoryItem(h)} 
                          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-indigo-400"
                        >
                          <i className="fas fa-redo text-sm"></i>
                        </button>
                        <button 
                          title="Salin URL" 
                          onClick={() => copyToClipboard(h.url)} 
                          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-indigo-400"
                        >
                          <i className="fas fa-copy text-sm"></i>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Footer Note */}
            <section className="mt-8 p-4 rounded-lg bg-[#1a1f2e] border border-gray-700/50">
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                <i className="fas fa-info-circle mr-2 text-indigo-400"></i>
                <strong className="text-gray-400">Catatan:</strong> Pastikan penggunaan KinoSave mematuhi hak cipta dan ketentuan layanan situs sumber.
              </p>
              
              {demoMode && (
                <div className="pt-3 border-t border-gray-700/50">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <i className="fas fa-code mr-2 text-gray-500"></i>
                    <strong className="text-gray-500">Untuk Developer:</strong> Website seperti Y2mate bekerja dengan backend server yang:
                  </p>
                  <ul className="mt-2 ml-6 text-xs text-gray-600 space-y-1">
                    <li>• Menggunakan library seperti <code className="text-indigo-400">yt-dlp</code>, <code className="text-indigo-400">youtube-dl</code>, atau API pihak ketiga</li>
                    <li>• Memproses URL video di server-side (Node.js, Python, PHP, dll)</li>
                    <li>• Mengembalikan link download yang valid ke frontend</li>
                    <li>• Menyimpan file sementara di server atau cloud storage</li>
                  </ul>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
