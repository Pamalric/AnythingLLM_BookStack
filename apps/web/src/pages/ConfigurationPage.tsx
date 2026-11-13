import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../components/Toaster";
import { apiFetch } from "../lib/api";

type Settings = {
  bookstackBaseUrl: string;
  anythingllmBaseUrl: string;
  workspaceSlug: string | null;
  bookstackInstanceId: string;
  scheduleEnabled: boolean;
  scheduleIntervalMin: number;
  removalPolicy: string;
  timezone: string;
  credentials: {
    bookstackToken: { configured: boolean; source: string };
    anythingllmApiKey: { configured: boolean; source: string };
  };
  lastTests: {
    bookstack: { at: string | null; ok: boolean | null; message: string | null };
    anythingllm: { at: string | null; ok: boolean | null; message: string | null };
  };
  syncAlreadyStarted: boolean;
};

const INTERVALS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 heure" },
  { value: 360, label: "6 heures" },
  { value: 1440, label: "24 heures" },
];

function looksLikeApiKey(value: string): boolean {
  return /^[A-Z0-9]{4,}-[A-Z0-9-]{8,}$/i.test(value.trim());
}

export function ConfigurationPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmWorkspace, setConfirmWorkspace] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bookstackBaseUrl, setBookstackBaseUrl] = useState("");
  const [anythingllmBaseUrl, setAnythingllmBaseUrl] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMin, setScheduleIntervalMin] = useState(60);

  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    const res = await apiFetch<Settings>("/api/v1/settings");
    if (!res.ok) {
      setLoadError(res.message);
      toast.error(res.message);
      return;
    }
    setLoadError(null);
    setSettings(res.data);
    setBookstackBaseUrl(res.data.bookstackBaseUrl);
    setAnythingllmBaseUrl(res.data.anythingllmBaseUrl);
    const slug = res.data.workspaceSlug ?? "";
    if (looksLikeApiKey(slug)) {
      setWorkspaceSlug("");
      setApiKey(slug);
      toast.info("Valeur type clé API détectée dans Workspace : déplacée vers AnythingLLM.");
    } else {
      setWorkspaceSlug(slug);
    }
    setScheduleEnabled(res.data.scheduleEnabled);
    setScheduleIntervalMin(res.data.scheduleIntervalMin);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveAnythingllm(e?: FormEvent) {
    e?.preventDefault();
    if (looksLikeApiKey(workspaceSlug)) {
      toast.error("Le workspace est un slug (ex. support-produit), pas la clé API.");
      return;
    }
    setBusy(true);

    if (apiKey.trim()) {
      const secretRes = await apiFetch<{ updated: boolean }>("/api/v1/settings/secrets", {
        method: "PUT",
        body: JSON.stringify({ anythingllmApiKey: apiKey.trim() }),
      });
      if (!secretRes.ok) {
        setBusy(false);
        toast.error(secretRes.message);
        return;
      }
    }

    const res = await apiFetch<Settings>("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({
        anythingllmBaseUrl,
        workspaceSlug: workspaceSlug || null,
        confirmWorkspaceChange: confirmWorkspace || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setSettings(res.data);
    setConfirmWorkspace(false);
    if (apiKey.trim()) setApiKey("");
    toast.success("AnythingLLM enregistré");
    await load();
  }

  async function saveBookstack(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);

    if (tokenId.trim() || tokenSecret.trim()) {
      if (!tokenId.trim() || !tokenSecret.trim()) {
        setBusy(false);
        toast.error("Renseignez Token ID et Token Secret ensemble.");
        return;
      }
      const secretRes = await apiFetch<{ updated: boolean }>("/api/v1/settings/secrets", {
        method: "PUT",
        body: JSON.stringify({
          bookstackTokenId: tokenId.trim(),
          bookstackTokenSecret: tokenSecret.trim(),
        }),
      });
      if (!secretRes.ok) {
        setBusy(false);
        toast.error(secretRes.message);
        return;
      }
    }

    const res = await apiFetch<Settings>("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({ bookstackBaseUrl }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setSettings(res.data);
    if (tokenId || tokenSecret) {
      setTokenId("");
      setTokenSecret("");
    }
    toast.success("BookStack enregistré");
    await load();
  }

  async function saveSchedule(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const res = await apiFetch<Settings>("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({
        scheduleEnabled,
        scheduleIntervalMin,
        removalPolicy: "manual_approval",
        timezone: "Europe/Paris",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setSettings(res.data);
    toast.success("Planification enregistrée");
  }

  async function testConnection(target: "bookstack" | "anythingllm" | "both") {
    setBusy(true);
    const res = await apiFetch<{
      ok: boolean;
      results: Record<string, { ok: boolean; message: string }>;
    }>("/api/v1/connections/test", {
      method: "POST",
      body: JSON.stringify({ target }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const lines = Object.entries(res.data.results).map(
      ([k, v]) => `${k}: ${v.ok ? "OK" : "Échec"} — ${v.message}`,
    );
    if (res.data.ok) toast.success(lines.join(" · "));
    else toast.error(lines.join(" · "));
    await load();
  }

  async function refreshWorkspaces() {
    setBusy(true);
    if (apiKey.trim()) {
      const secretRes = await apiFetch<{ updated: boolean }>("/api/v1/settings/secrets", {
        method: "PUT",
        body: JSON.stringify({ anythingllmApiKey: apiKey.trim() }),
      });
      if (!secretRes.ok) {
        setBusy(false);
        toast.error(secretRes.message);
        return;
      }
      setApiKey("");
      await load();
    }
    const res = await apiFetch<{ workspaces: Array<{ slug: string }> }>(
      "/api/v1/settings/workspaces",
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(
        res.code === "CREDENTIALS_MISSING"
          ? "Clé API AnythingLLM absente. Renseignez-la puis réessayez."
          : res.message,
      );
      return;
    }
    const slugs = res.data.workspaces.map((w) => w.slug);
    setWorkspaces(slugs);
    if (slugs.length) toast.success(`${slugs.length} workspace(s) chargés`);
    else toast.info("Aucun workspace visible avec cette clé.");
  }

  if (!settings) {
    return <p className="text-slate-600">{loadError ?? "Chargement de la configuration…"}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink">Configuration</h1>
      </section>

      {/* ——— Zone 1 : AnythingLLM ——— */}
      <form
        onSubmit={(e) => void saveAnythingllm(e)}
        className="space-y-4 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">1. AnythingLLM</h2>
          <p className="text-sm text-slate-600">
            Clé :{" "}
            {settings.credentials.anythingllmApiKey.configured
              ? `présente (${settings.credentials.anythingllmApiKey.source})`
              : "absente"}
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">URL AnythingLLM</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={anythingllmBaseUrl}
            onChange={(e) => setAnythingllmBaseUrl(e.target.value)}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Clé API</span>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              settings.credentials.anythingllmApiKey.configured
                ? "Laisser vide pour conserver la clé actuelle, ou coller une nouvelle clé"
                : "Coller la clé API AnythingLLM"
            }
          />
        </label>

        <div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="block min-w-[16rem] flex-1 text-sm">
              <span className="mb-1 block text-slate-700">Workspace cible (slug)</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
                placeholder="ex. support-produit"
                list="workspace-slugs"
              />
              <datalist id="workspace-slugs">
                {workspaces.map((slug) => (
                  <option key={slug} value={slug} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshWorkspaces()}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              Charger les workspaces
            </button>
          </div>
          {workspaces.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {workspaces.map((slug) => (
                <li key={slug}>
                  <button
                    type="button"
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800 ring-1 ring-slate-200 hover:bg-blue-50"
                    onClick={() => setWorkspaceSlug(slug)}
                  >
                    {slug}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {settings.syncAlreadyStarted ? (
          <label className="flex items-start gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={confirmWorkspace}
              onChange={(e) => setConfirmWorkspace(e.target.checked)}
              className="mt-1"
            />
            <span>Confirmer le changement de workspace (sync déjà effectuée).</span>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            Enregistrer AnythingLLM
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void testConnection("anythingllm")}
            className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            Tester AnythingLLM
          </button>
        </div>
      </form>

      {/* ——— Zone 2 : BookStack ——— */}
      <form
        onSubmit={(e) => void saveBookstack(e)}
        className="space-y-4 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">2. BookStack</h2>
          <p className="text-sm text-slate-600">
            Token :{" "}
            {settings.credentials.bookstackToken.configured
              ? `présent (${settings.credentials.bookstackToken.source})`
              : "absent"}
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">URL BookStack</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={bookstackBaseUrl}
            onChange={(e) => setBookstackBaseUrl(e.target.value)}
            required
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Token ID</span>
            <input
              type="text"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                settings.credentials.bookstackToken.configured
                  ? "Laisser vide pour conserver, ou coller un nouvel ID"
                  : "Token ID"
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Token Secret</span>
            <input
              type="text"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                settings.credentials.bookstackToken.configured
                  ? "Laisser vide pour conserver, ou coller un nouveau secret"
                  : "Token Secret"
              }
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            Enregistrer BookStack
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void testConnection("bookstack")}
            className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            Tester BookStack
          </button>
        </div>
      </form>

      {/* ——— Zone 3 : Planification + derniers tests ——— */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">3. Planification et derniers tests</h2>

        <form onSubmit={(e) => void saveSchedule(e)} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            Activer le planificateur
          </label>
          <label className="block max-w-sm text-sm">
            <span className="mb-1 block text-slate-700">Fréquence</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={scheduleIntervalMin}
              onChange={(e) => setScheduleIntervalMin(Number(e.target.value))}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-slate-600">
            Fuseau : {settings.timezone} · Retraits : approbation manuelle (V1)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              Enregistrer la planification
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void testConnection("both")}
              className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              Tester les deux connexions
            </button>
          </div>
        </form>

        <div className="border-t border-slate-200 pt-4 text-sm text-slate-700">
          <p className="font-semibold text-ink">Derniers tests</p>
          <ul className="mt-2 space-y-2">
            <li>
              BookStack :{" "}
              {settings.lastTests.bookstack.at
                ? `${settings.lastTests.bookstack.ok ? "OK" : "Échec"} — ${settings.lastTests.bookstack.message}`
                : "aucun"}
            </li>
            <li>
              AnythingLLM :{" "}
              {settings.lastTests.anythingllm.at
                ? `${settings.lastTests.anythingllm.ok ? "OK" : "Échec"} — ${settings.lastTests.anythingllm.message}`
                : "aucun"}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
