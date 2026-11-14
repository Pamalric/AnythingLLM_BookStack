import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toaster";
import { apiFetch } from "../lib/api";
import { formatDate, formatDuration } from "../lib/format";
import { formatCounters } from "../lib/labels";

type RunRow = {
  id: string;
  type: string;
  trigger: string;
  actor: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  progressDone: number;
  progressTotal: number;
  phase: string | null;
  counters: Record<string, number>;
  errorSummary: string | null;
};

type RunList = {
  page: number;
  pageSize: number;
  total: number;
  items: RunRow[];
};

type RunDetail = RunRow & {
  events: Array<{
    id: string;
    sourcePageId: string | null;
    action: string;
    status: string;
    message: string | null;
    diagnosticCode: string | null;
    createdAt: string;
  }>;
};

export function HistoryPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [list, setList] = useState<RunList | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [errorOnly, setErrorOnly] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) qs.set("status", status);
    const res = await apiFetch<RunList>(`/api/v1/sync-runs?${qs}`);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setList(res.data);
  }, [page, status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasRunning = Boolean(list?.items.some((r) => r.status === "RUNNING"));
  useEffect(() => {
    if (!hasRunning && detail?.status !== "RUNNING") return;
    const t = window.setInterval(() => {
      void load();
      if (detail?.status === "RUNNING") void openDetail(detail.id, false);
    }, 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunning, detail?.id, detail?.status, load]);

  useEffect(() => {
    const runId = params.get("run");
    if (runId) void openDetail(runId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function openDetail(id: string, updateUrl = true) {
    const res = await apiFetch<RunDetail>(`/api/v1/sync-runs/${id}`);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setDetail(res.data);
    if (updateUrl) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("run", id);
        return next;
      });
    }
  }

  function closeDetail() {
    setDetail(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("run");
      return next;
    });
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const events =
    detail?.events.filter((e) => !errorOnly || e.status === "ERROR" || e.status === "FAILED") ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink">Historique</h1>
        <p className="mt-1 text-slate-600">
          Exécutions de synchronisation et événements associés (rétention 90 jours).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="RUNNING">RUNNING</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="FAILED">FAILED</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            Actualiser
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white/80 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Début</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Déclencheur</th>
              <th className="px-3 py-2 font-semibold">Acteur</th>
              <th className="px-3 py-2 font-semibold">Durée</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-semibold">Détail</th>
            </tr>
          </thead>
          <tbody>
            {list?.items.length ? (
              list.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{formatDate(r.startedAt)}</td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">{r.trigger}</td>
                  <td className="px-3 py-2">{r.actor ?? "—"}</td>
                  <td className="px-3 py-2">{formatDuration(r.durationMs)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => void openDetail(r.id)}
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-600">
                  Aucune exécution enregistrée pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {list && list.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {list.total} exécution(s) · page {list.page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="rounded-md bg-white px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              className="rounded-md bg-white px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Exécution</h2>
                <p className="mt-1 font-mono text-xs text-slate-500" title="Identifiant de corrélation">
                  {detail.id}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge value={detail.status} />
                  <span className="text-sm text-slate-600">
                    {detail.trigger} / {detail.type}
                  </span>
                </div>
                {detail.status === "PARTIAL" ? (
                  <p className="mt-2 text-sm text-amber-800">
                    Succès partiel — des erreurs documentaires subsistent.
                  </p>
                ) : null}
              </div>
              <button type="button" className="text-sm text-slate-600" onClick={closeDetail}>
                Fermer
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>Début : {formatDate(detail.startedAt)}</p>
              <p>Fin : {formatDate(detail.finishedAt)}</p>
              <p>Durée : {formatDuration(detail.durationMs)}</p>
              <p>Acteur : {detail.actor ?? "—"}</p>
              <p>
                Progression : {detail.progressDone}/{detail.progressTotal}
              </p>
              <p>Phase : {detail.phase ?? "—"}</p>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              Compteurs : {formatCounters(detail.counters)}
            </p>
            {detail.errorSummary ? (
              <p className="mt-2 text-sm text-red-700">{detail.errorSummary}</p>
            ) : null}

            <div className="mt-4 flex items-center justify-between">
              <p className="font-semibold text-ink">Événements</p>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={errorOnly}
                  onChange={(e) => setErrorOnly(e.target.checked)}
                />
                Erreurs seulement
              </label>
            </div>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm text-slate-700">
              {events.length ? (
                events.map((e) => (
                  <li key={e.id} className="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    <p className="font-medium">
                      {formatDate(e.createdAt)} — {e.action} / {e.status}
                    </p>
                    {e.message ? <p className="mt-1 text-slate-600">{e.message}</p> : null}
                    {e.diagnosticCode ? (
                      <p className="mt-1 font-mono text-xs text-slate-500">{e.diagnosticCode}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-slate-600">Aucun événement.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
