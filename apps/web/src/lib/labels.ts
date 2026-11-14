/** Libellés FR pour compteurs de sync (console). */
const COUNTER_LABELS: Record<string, string> = {
  added: "ajouts",
  updated: "modifications",
  unchanged: "inchangés",
  errors: "erreurs",
  proposedRemovals: "retraits proposés",
  skipped: "ignorés",
  dryRunWouldAdd: "simul. ajouts",
  dryRunWouldUpdate: "simul. mises à jour",
};

export function formatCounters(counters: Record<string, number>): string {
  const entries = Object.entries(counters).filter(([, v]) => typeof v === "number");
  if (!entries.length) return "—";
  return entries
    .map(([k, v]) => `${COUNTER_LABELS[k] ?? k}=${v}`)
    .join(", ");
}

export const APP_VERSION = "v.26.11.13";
