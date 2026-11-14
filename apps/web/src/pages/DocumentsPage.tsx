import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toaster";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/format";

type DocRow = {
  id: string;
  bookstackId: number;
  title: string;
  bookName: string | null;
  chapterName: string | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  lastSyncAt: string | null;
  state: string;
  lastError: string | null;
  contentHash: string | null;
  targetPath: string | null;
};

type DocList = {
  page: number;
  pageSize: number;
  total: number;
  items: DocRow[];
};

type DocDetail = DocRow & {
  sourceKey: string;
  bookId: number | null;
  chapterId: number | null;
  target: {
    documentPath: string;
    workspaceSlug: string;
    publishedHash: string | null;
    indexedAt: string | null;
    ownership: string;
  } | null;
  recentEvents: Array<{
    id: string;
    action: string;
    status: string;
    message: string | null;
    createdAt: string;
  }>;
};

type Removal = {
  id: string;
  title: string | null;
  bookName: string | null;
  bookstackId: number | null;
  reason: string;
  detectedAt: string;
};

const STATES = [
  "",
  "NEW",
  "SYNCED",
  "OUTDATED",
  "PROCESSING",
  "ERROR",
  "PENDING_REMOVAL",
  "ACCESS_REVIEW",
  "REMOVED",
];

export function DocumentsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"docs" | "removals">("docs");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<DocList | null>(null);
  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [removals, setRemovals] = useState<Removal[]>([]);
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (state) params.set("state", state);
    const res = await apiFetch<DocList>(`/api/v1/documents?${params}`);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setList(res.data);
  }, [page, q, state, toast]);

  const loadRemovals = useCallback(async () => {
    const res = await apiFetch<{ items: Removal[] }>("/api/v1/removals");
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setRemovals(res.data.items);
  }, [toast]);

  useEffect(() => {
    if (tab === "docs") void loadDocs();
    else void loadRemovals();
  }, [tab, loadDocs, loadRemovals]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function applySearch() {
    setPage(1);
    setQ(qDraft.trim());
  }

  async function openDetail(id: string) {
    const res = await apiFetch<DocDetail>(`/api/v1/documents/${id}`);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setSelected(res.data);
  }

  async function resync(id: string, hasTarget: boolean) {
    const msg = hasTarget
      ? "Resynchroniser ce document ? Une nouvelle version sera indexée avant retrait de l’ancienne."
      : "Resynchroniser ce document (première indexation) ?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await apiFetch(`/api/v1/documents/${id}/sync`, { method: "POST", body: "{}" });
    setBusy(false);
    if (!res.ok) toast.error(res.message);
    else {
      toast.success("Resynchronisation demandée — suivi dans Historique");
      await loadDocs();
    }
  }

  async function decideRemoval(id: string, decision: "approve" | "reject") {
    const confirmMsg =
      decision === "approve"
        ? "Approuver le retrait du document AnythingLLM (CONNECTOR_OWNED uniquement) ?"
        : "Rejeter cette proposition de retrait ?";
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    const res = await apiFetch(`/api/v1/removals/${id}/${decision}`, {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (!res.ok) toast.error(res.message);
    else {
      toast.success(decision === "approve" ? "Retrait approuvé" : "Retrait rejeté");
      await loadRemovals();
    }
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink">Documents</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("docs")}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              tab === "docs" ? "bg-accent text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            Inventaire
          </button>
          <button
            type="button"
            onClick={() => setTab("removals")}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              tab === "removals"
                ? "bg-accent text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            File des retraits ({removals.length || "…"})
          </button>
        </div>
      </section>

      {tab === "docs" ? (
        <>
          <section className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm">
            <input
              className="min-w-[12rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Rechercher titre, livre…"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={state}
              onChange={(e) => {
                setPage(1);
                setState(e.target.value);
              }}
            >
              {STATES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Tous les statuts"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applySearch}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              Rechercher
            </button>
            <button
              type="button"
              onClick={() => void loadDocs()}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              Actualiser
            </button>
          </section>

          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white/80 shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Titre</th>
                  <th className="px-3 py-2 font-semibold">Livre</th>
                  <th className="px-3 py-2 font-semibold">Page ID</th>
                  <th className="px-3 py-2 font-semibold">Modif. source</th>
                  <th className="px-3 py-2 font-semibold">Dernier sync</th>
                  <th className="px-3 py-2 font-semibold">État</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list?.items.length ? (
                  list.items.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium text-ink">{d.title}</td>
                      <td className="px-3 py-2 text-slate-700">{d.bookName ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.bookstackId}</td>
                      <td className="px-3 py-2">{formatDate(d.sourceUpdatedAt)}</td>
                      <td className="px-3 py-2">{formatDate(d.lastSyncAt)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge value={d.state} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-accent underline"
                            onClick={() => void openDetail(d.id)}
                          >
                            Détails
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="text-slate-700 underline disabled:opacity-50"
                            onClick={() => void resync(d.id, Boolean(d.targetPath))}
                          >
                            Resync
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-600">
                      Aucun document inventorié. Lancez d’abord une simulation depuis le tableau de
                      bord.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {list && list.total > 0 ? (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {list.total} document(s) · page {list.page}/{totalPages}
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
        </>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white/80 shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Titre</th>
                <th className="px-3 py-2 font-semibold">Livre</th>
                <th className="px-3 py-2 font-semibold">Motif</th>
                <th className="px-3 py-2 font-semibold">Détecté</th>
                <th className="px-3 py-2 font-semibold">Décision</th>
              </tr>
            </thead>
            <tbody>
              {removals.length ? (
                removals.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{r.title ?? "—"}</td>
                    <td className="px-3 py-2">{r.bookName ?? "—"}</td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="px-3 py-2">{formatDate(r.detectedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          className="text-emerald-700 underline"
                          onClick={() => void decideRemoval(r.id, "approve")}
                        >
                          Approuver
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-red-700 underline"
                          onClick={() => void decideRemoval(r.id, "reject")}
                        >
                          Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-600">
                    Aucun retrait en attente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{selected.title}</h2>
              <button
                type="button"
                className="text-sm text-slate-600"
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p>
                <StatusBadge value={selected.state} />
              </p>
              <p>Clé : {selected.sourceKey}</p>
              <p>Page BookStack : {selected.bookstackId}</p>
              <p>
                Livre / chapitre : {selected.bookName ?? "—"} / {selected.chapterName ?? "—"}
              </p>
              <p>
                URL :{" "}
                {selected.sourceUrl ? (
                  <a
                    className="text-accent underline"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ouvrir
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <p>Hash : {selected.contentHash ?? "—"}</p>
              <p>
                Chemin AnythingLLM :{" "}
                {selected.target?.documentPath ?? selected.targetPath ?? "—"}
              </p>
              <p>Ownership : {selected.target?.ownership ?? "—"}</p>
              <p>Dernière erreur : {selected.lastError ?? "—"}</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void resync(selected.id, Boolean(selected.target))}
              >
                Resynchroniser
              </button>
            </div>
            {selected.recentEvents?.length ? (
              <div className="mt-4">
                <p className="font-semibold text-ink">Événements récents</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {selected.recentEvents.map((e) => (
                    <li key={e.id}>
                      {formatDate(e.createdAt)} — {e.action} / {e.status}
                      {e.message ? ` — ${e.message}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
