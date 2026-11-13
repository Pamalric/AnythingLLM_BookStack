import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { readCsrfCookie } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Connexion impossible");
        return;
      }
      // CSRF cookie posé par le serveur pour les mutations suivantes
      void readCsrfCookie();
      navigate("/");
    } catch {
      setError("Réseau indisponible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-xl border border-slate-200 bg-white/90 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">XPERTEAM</p>
        <h1 className="mt-2 font-display text-3xl text-ink">BookStack Sync</h1>
        <p className="mt-2 text-slate-600">Connexion administrateur</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Identifiant</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Mot de passe</span>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}
