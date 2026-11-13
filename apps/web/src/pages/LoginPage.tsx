import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toaster";
import { readCsrfCookie } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState("administrator");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(body?.message ?? "Connexion impossible");
        return;
      }
      void readCsrfCookie();
      toast.success("Connexion réussie");
      navigate("/");
    } catch {
      toast.error("Réseau indisponible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-xl border border-slate-200 bg-white/90 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">XPERTEAM</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">BookStack Sync</h1>
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
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">v.26.11.13</p>
    </main>
  );
}
