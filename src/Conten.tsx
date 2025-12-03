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
  const [dark, setDark] = useState(() => {
    // default to prefers-color-scheme
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [demoMode] = useState(false); // set true to force demo mode

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
        await new Promise((r) => setTimeout(r, 800));
        const fake: DownloadResult = {
          downloadUrl: `https://kinosave.example/download/${encodeURIComponent(url)}?type=${type}`,
          filename: `kinosave-${type}-${Date.now()}.mp4`,
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl shadow-lg p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-md bg-indigo-600 flex items-center justify-center text-white text-xl font-semibold">KS</div>
            <div>
              <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">KinoSave</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Download Video / Audio dari YouTube, IG, Facebook dan lainnya</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle theme"
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <i className={`fas ${dark ? "fa-sun" : "fa-moon"}`}></i>
            </button>
          </div>
        </header>

        <main>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Masukkan link (YouTube / Facebook / Instagram / dll)</label>
            <div className="flex gap-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-md border p-3 focus:outline-none focus:ring focus:border-indigo-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              />

              <div className="flex items-center gap-2">
                <select value={type} onChange={(e) => setType(e.target.value as "video" | "audio")} className="rounded-md p-2 border bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
                  <option value="video">Video (mp4)</option>
                  <option value="audio">Audio (mp3)</option>
                </select>
                <button
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  {loading ? "Memproses..." : "Download"}
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            {result && (
              <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 border dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Hasil</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{result.filename || "file"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={result.downloadUrl} className="px-3 py-1 border rounded-md" target="_blank" rel="noreferrer">Buka link</a>
                    <button onClick={() => copyToClipboard(result.downloadUrl)} className="px-3 py-1 border rounded-md">Salin</button>
                  </div>
                </div>
              </div>
            )}
          </form>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">Riwayat</h3>
              <div className="text-xs text-gray-500">
                <button onClick={clearHistory} className="underline">Bersihkan</button>
              </div>
            </div>

            <div className="mt-3 space-y-2 max-h-48 overflow-auto">
              {history.length === 0 && <div className="text-sm text-gray-500">Belum ada riwayat</div>}
              {history.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{h.url}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{h.type} • {new Date(h.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button title="Gunakan" onClick={() => useHistoryItem(h)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><i className="fas fa-redo"></i></button>
                    <button title="Salin" onClick={() => copyToClipboard(h.url)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><i className="fas fa-copy"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 text-xs text-gray-500">
            <p>Catatan: Pastikan penggunaan KinoSave mematuhi hak cipta dan ketentuan layanan situs sumber. Aplikasi ini hanya UI — proses download memerlukan backend yang meng-handle pemrosesan dan konversi.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
