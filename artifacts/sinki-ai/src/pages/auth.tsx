import { useState } from "react";
import { useAuth } from "@/context/auth";
import { Star } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="auth-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="33%" stopColor="#9b72cb" />
            <stop offset="66%" stopColor="#d96570" />
            <stop offset="100%" stopColor="#F4B400" />
          </linearGradient>
        </defs>
      </svg>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
               style={{ background: "radial-gradient(circle, rgba(66,133,244,0.2) 0%, rgba(234,67,53,0.1) 60%, transparent 100%)" }}>
            <Star className="w-10 h-10" style={{ fill: "url(#auth-gradient)", stroke: "none" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">SINKI AI</h1>
          <p className="text-gray-400 text-sm mt-1">
            {mode === "login" ? "Masuk ke akun kamu" : "Buat akun baru"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <div>
              <input
                type="text"
                placeholder="Nama (opsional)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors text-[15px]"
              />
            </div>
          )}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-[#1c1c1c] border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors text-[15px]"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-[#1c1c1c] border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors text-[15px]"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center py-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-medium text-[15px] transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #4285F4, #9b72cb, #d96570)" }}
          >
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
          <button
            className="text-white underline underline-offset-2"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Daftar di sini" : "Masuk"}
          </button>
        </p>
      </div>
    </div>
  );
}
