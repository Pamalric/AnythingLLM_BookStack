import { useEffect, useState, type FormEvent } from "react";
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

export function ConfigurationPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWorkspace, setConfirmWorkspace] = useState(false);

  const [bookstackBaseUrl, setBookstackBaseUrl] = useState("");
  const [anythingllmBaseUrl, setAnythingllmBaseUrl] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMin, setScheduleIntervalMin] = useState(60);

  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    setError(null);
    const res = await apiFetch<Settings>("/api/v1/settings");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSettings(res.data);
    setBookstackBaseUrl(res.data.bookstackBaseUrl);
    setAnythingllmBaseUrl(res.data.anythingllmBaseUrl);
    setWorkspaceSlug(res.data.workspaceSlug ?? "");
    setScheduleEnabled(res.data.scheduleEnabled);
    setScheduleIntervalMin(res.data.scheduleIntervalMin);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiFetch<Settings>("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({
        bookstackBaseUrl,
        anythingllmBaseUrl,
        workspaceSlug: workspaceSlug || null,
        scheduleEnabled,
        scheduleIntervalMin,
        removalPolicy: "manual_approval",
        timezone: "Europe/Paris",
        confirmWorkspaceChange: confirmWorkspace || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSettings(res.data);
    setInfo("Configuration enregistrée");
    setConfirmWorkspace(false);
  }

  async function onSaveSecrets(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const body: Record<string, string> = {};
    if (tokenId && tokenSecret) {
      body.bookstackTokenId = tokenId;
      body.bookstackTokenSecret = tokenSecret;
    }
    if (apiKey) {
      body.anythingllmApiKey = apiKey;
    }
    const res = await apiFetch<{ updated: boolean }>("/api/v1/settings/secrets", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setTokenId("");
    setTokenSecret("");
    setApiKey("");
    setInfo("Secrets enregistrés (non restitués à l'interface)");
    await load();
  }

  async function testConnection(target: "bookstack" | "anythingllm" | "both") {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiFetch<{
      ok: boolean;
      results: Record<string, { ok: boolean; message: string }>;
    }>("/api/v1/connections/test", {
      method: "POST",
      body: JSON.stringify({ target }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const lines = Object.entries(res.data.results).map(
      ([k, v]) => `${k}: ${v.ok ? "OK" : "Échec"} — ${v.message}`,
    );
    if (res.data.ok) {
      setInfo(lines.join(" · "));
    } else {
      setError(lines.join(" · "));
    }
    await load();
  }

  async function refreshWorkspaces() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ workspaces: Array<{ slug: string }> }>(
      "/api/v1/settings/workspaces",
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setWorkspaces(res.data.workspaces.map((w) => w.slug));
  }

  if (!settings) {
    return <p className="text-slate-600">{error ?? "Chargement de la configuration…"}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h1 className="font-display text-2xl text-ink">Configuration</h1>
        <p className="mt-1 text-slate-600">
          Source BookStack, cible AnythingLLM, cadence et politique de retraits. Les secrets ne sont
          jamais réaffichés.
        </p>
      </section>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
          {info}
        </p>
      ) : null}

      <form
        onSubmit={onSave}
        className="space-y-4 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-ink">Connexions</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">URL BookStack</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={bookstackBaseUrl}
            onChange={(e) => setBookstackBaseUrl(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">URL AnythingLLM</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={anythingllmBaseUrl}
            onChange={(e) => setAnythingllmBaseUrl(e.target.value)}
            required
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[16rem] flex-1 text-sm">
            <span className="mb-1 block text-slate-700">Workspace cible (slug)</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={workspaceSlug}
              onChange={(e) => setWorkspaceSlug(e.target.value)}
              placeholder="bookstack-sync-recette"
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
        {settings.syncAlreadyStarted ? (
          <label className="flex items-start gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={confirmWorkspace}
              onChange={(e) => setConfirmWorkspace(e.target.checked)}
              className="mt-1"
            />
            <span>
              Confirmer un changement de workspace (une synchronisation a déjà écrit des documents).
            </span>
          </label>
        ) : null}

        <h2 className="pt-2 text-lg font-semibold text-ink">Planification</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
          />
          Activer le planificateur
        </label>
        <label className="block text-sm">
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

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            Enregistrer
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void testConnection("both")}
            className="rounded-md bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            Tester les connexions
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void testConnection("bookstack")}
            className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
          >
            Test BookStack
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void testConnection("anythingllm")}
            className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
          >
            Test AnythingLLM
          </button>
        </div>
      </form>

      <form
        onSubmit={onSaveSecrets}
        className="space-y-4 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-ink">Secrets API</h2>
        <p className="text-sm text-slate-600">
          BookStack token :{" "}
          {settings.credentials.bookstackToken.configured
            ? `configuré (${settings.credentials.bookstackToken.source})`
            : "absent"}{" "}
          · AnythingLLM :{" "}
          {settings.credentials.anythingllmApiKey.configured
            ? `configurée (${settings.credentials.anythingllmApiKey.source})`
            : "absente"}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">BookStack Token ID</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              autoComplete="off"
              placeholder="Nouveau ID (jamais réaffiché)"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">BookStack Token Secret</span>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.target.value)}
              autoComplete="new-password"
              placeholder="Nouveau secret"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Clé API AnythingLLM</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="new-password"
            placeholder="Nouvelle clé (jamais réaffichée)"
          />
        </label>
        <button
          type="submit"
          disabled={busy || (!tokenId && !apiKey)}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Enregistrer les secrets
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white/80 p-6 text-sm shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Derniers tests</h2>
        <ul className="mt-3 space-y-2 text-slate-700">
          <li>
            BookStack :{" "}
            {settings.lastTests.bookstack.at
              ? `${settings.lastTests.bookstack.ok ? "OK" : "Échec"} — ${settings.lastTests.bookstack.message} (${settings.lastTests.bookstack.at})`
              : "aucun"}
          </li>
          <li>
            AnythingLLM :{" "}
            {settings.lastTests.anythingllm.at
              ? `${settings.lastTests.anythingllm.ok ? "OK" : "Échec"} — ${settings.lastTests.anythingllm.message} (${settings.lastTests.anythingllm.at})`
              : "aucun"}
          </li>
        </ul>
      </section>
    </div>
  );
}
