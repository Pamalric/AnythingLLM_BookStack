import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";

const nav = [
  { to: "/", label: "Tableau de bord" },
  { to: "/documents", label: "Documents" },
  { to: "/historique", label: "Historique" },
  { to: "/configuration", label: "Configuration" },
];

export function ShellLayout() {
  const location = useLocation();
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setAuth("no");
          return;
        }
        const body = (await res.json()) as { username?: string };
        setUsername(body.username ?? null);
        setAuth("yes");
      })
      .catch(() => {
        if (!cancelled) setAuth("no");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth === "loading") {
    return <p className="p-8 text-slate-600">Vérification de session…</p>;
  }
  if (auth === "no") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">XPERTEAM</p>
          <h1 className="font-display text-3xl text-ink">BookStack Sync</h1>
        </div>
        <p className="text-sm text-slate-600">{username}</p>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Navigation principale">
        {nav.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                active ? "bg-accent text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
