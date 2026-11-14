import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toaster";
import { apiFetch } from "../lib/api";
import { formatDate, formatDuration } from "../lib/format";
import { formatCounters } from "../lib/labels";

type Dashboard = {
  connections: {
    bookstack: { ok: boolean | null; at: string | null; message: string | null };
    anythingllm: { ok: boolean | null; at: string | null; message: string | null };
  };
  counts: {
    books: number;
    pages: number;
    synced: number;
    pending: number;
    errors: number;
    pendingRemoval: number;
  };
  schedule: {
    enabled: boolean;
    intervalMin: number;
    timezone: string;
    nextRunAt: string | null;
  };
  currentRun: {
    id: string;
    status: string;
    phase: string | null;
    progressDone: number;
    progressTotal: number;
    startedAt: string;
  } | null;
  lastRun: {
    id: string;
    status: string;
    type: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    counters: Record<string, number>;
    errorSummary: string | null;
  } | null;
  workspaceSlug: string | null;
};

function ConnPill({
  label,
  ok,
  at,
  message,
}: {
  label: string;
  ok: boolean | null;
  at: string | null;
  message: string | null;
}) {
  const color =
    ok === true
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : ok === false
        ? "bg-red-50 text-red-800 ring-red-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  const text = ok === true ? "OK" : ok === false ? "Échec" : "Non testé";
  return (
    <div className={`rounded-md px-3 py-2 text-sm ring-1 ${color}`}>
      <p className="font-semibold">
        {label} : {text}
      </p>
      <p className="mt-0.5 opacity-80">{at ? formatDate(at) : "—"}</p>
      {message ? <p className="mt-1 text-xs opacity-90">{message}</p> : null}
    </div>
  );
}

export function DashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<Dashboard>("/api/v1/dashboard");
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setData(res.data);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ms = data?.currentRun ? 2000 : 5000;
    const t = window.setInterval(() => void load(), ms);
    return () => window.clearInterval(t);
  }, [load, data?.currentRun]);

  async function startSync(dryRun: boolean) {
    setBusy(true);
    const res = await apiFetch<{ id?: string }>("/api/v1/sync-runs", {
      method: "POST",
      body: JSON.stringify({
        type: dryRun ? "dry-run" : "incremental",
        trigger: "MANUAL",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(dryRun ? "Simulation acceptée" : "Synchronisation démarrée");
    await load();
  }

  if (!data) {
    return <p className="text-slate-600">Chargement du tableau de bord…</p>;
  }

  const progress =
    data.currentRun && data.currentRun.progressTotal > 0
      ? Math.round((100 * data.currentRun.progressDone) / data.currentRun.progressTotal)
      : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Tableau de bord</h1>
            <p className="mt-1 text-slate-600">
              Workspace : {data.workspaceSlug ?? "non défini"} · Fuseau {data.schedule.timezone}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || Boolean(data.currentRun)}
              onClick={() => void startSync(false)}
              className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              Synchroniser maintenant
            </button>
            <button
              type="button"
              disabled={busy || Boolean(data.currentRun)}
              onClick={() => void startSync(true)}
              className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
            >
              Simuler
            </button>
            <Link
              to="/configuration"
              className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              Configuration
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <ConnPill label="BookStack" {...data.connections.bookstack} />
        <ConnPill label="AnythingLLM" {...data.connections.anythingllm} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Livres", data.counts.books],
          ["Pages", data.counts.pages],
          ["Synchronisées", data.counts.synced],
          ["En attente", data.counts.pending],
          ["Erreurs", data.counts.errors],
          ["Retraits", data.counts.pendingRemoval],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm"
          >
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      {data.currentRun ? (
        <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">Traitement en cours</h2>
            <StatusBadge value={data.currentRun.status} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            Phase : {data.currentRun.phase ?? "—"} · Démarré {formatDate(data.currentRun.startedAt)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Fermer le navigateur n’interrompt pas le job (suivi côté serveur).
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {data.currentRun.progressDone} / {data.currentRun.progressTotal} pages
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Dernière exécution</h2>
          {data.lastRun ? (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={data.lastRun.status} />
                <span>
                  {data.lastRun.trigger} / {data.lastRun.type}
                </span>
              </div>
              {data.lastRun.status === "PARTIAL" ? (
                <p className="text-amber-800">
                  Terminé partiellement — certaines pages en erreur ; ce n’est pas un succès complet.
                </p>
              ) : null}
              <p>Début : {formatDate(data.lastRun.startedAt)}</p>
              <p>Durée : {formatDuration(data.lastRun.durationMs)}</p>
              <p>Compteurs : {formatCounters(data.lastRun.counters)}</p>
              {data.lastRun.errorSummary ? (
                <p className="text-red-700">{data.lastRun.errorSummary}</p>
              ) : null}
              <Link className="text-accent underline" to={`/historique?run=${data.lastRun.id}`}>
                Voir le détail
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Aucune exécution pour le moment.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Planification</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>État : {data.schedule.enabled ? "activée" : "désactivée"}</p>
            <p>Intervalle : {data.schedule.intervalMin} min</p>
            <p>Prochaine : {formatDate(data.schedule.nextRunAt)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
