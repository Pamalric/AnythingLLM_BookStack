const STATE_STYLES: Record<string, string> = {
  NEW: "bg-sky-50 text-sky-800 ring-sky-200",
  SYNCED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OUTDATED: "bg-amber-50 text-amber-900 ring-amber-200",
  PROCESSING: "bg-blue-50 text-blue-800 ring-blue-200",
  ERROR: "bg-red-50 text-red-800 ring-red-200",
  PENDING_REMOVAL: "bg-orange-50 text-orange-900 ring-orange-200",
  ACCESS_REVIEW: "bg-violet-50 text-violet-800 ring-violet-200",
  REMOVED: "bg-slate-100 text-slate-600 ring-slate-200",
  SUCCESS: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-900 ring-amber-200",
  FAILED: "bg-red-50 text-red-800 ring-red-200",
  RUNNING: "bg-blue-50 text-blue-800 ring-blue-200",
};

export function StatusBadge({ value }: { value: string }) {
  const style = STATE_STYLES[value] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${style}`}>
      {value}
    </span>
  );
}
