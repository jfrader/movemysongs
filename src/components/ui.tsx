import { PROVIDER_COLORS, PROVIDER_LABELS, type MusicProvider } from "@/lib/types";

export function ProviderTag({ provider }: { provider: MusicProvider }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: PROVIDER_COLORS[provider] }}
      />
      {PROVIDER_LABELS[provider]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <span className="text-neutral-500">–</span>;
  const cls =
    confidence >= 90
      ? "bg-emerald-500/15 text-emerald-400"
      : confidence >= 70
        ? "bg-amber-500/15 text-amber-400"
        : "bg-red-500/15 text-red-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {confidence}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matching: "bg-sky-500/15 text-sky-400",
    needs_review: "bg-amber-500/15 text-amber-400",
    executing: "bg-sky-500/15 text-sky-400",
    completed: "bg-emerald-500/15 text-emerald-400",
    partial: "bg-amber-500/15 text-amber-400",
    failed: "bg-red-500/15 text-red-400",
    canceled: "bg-neutral-500/15 text-neutral-400",
    auto_matched: "bg-emerald-500/15 text-emerald-400",
    accepted: "bg-emerald-500/15 text-emerald-400",
    added: "bg-emerald-500/15 text-emerald-400",
    unmatched: "bg-red-500/15 text-red-400",
    skipped: "bg-neutral-500/15 text-neutral-400",
    pending: "bg-neutral-500/15 text-neutral-400",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles[status] ?? "bg-neutral-500/15 text-neutral-400"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
      <div
        className="h-full rounded-full bg-sky-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-sky-400 align-middle" />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}
