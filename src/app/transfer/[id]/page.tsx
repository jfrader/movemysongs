"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  type Candidate,
  type Job,
  type JobItem,
  type MusicProvider,
} from "@/lib/types";
import {
  ConfidenceBadge,
  ErrorBanner,
  ProgressBar,
  ProviderTag,
  Spinner,
  StatusBadge,
} from "@/components/ui";

/** Accept a raw id or a pasted track URL from any of the three providers. */
function extractTrackId(input: string, provider: MusicProvider): string {
  const s = input.trim();
  const patterns: Record<MusicProvider, RegExp[]> = {
    spotify: [/open\.spotify\.com\/track\/([A-Za-z0-9]+)/],
    tidal: [/tidal\.com\/(?:browse\/)?track\/(\d+)/],
    youtube: [/[?&]v=([\w-]{6,})/, /youtu\.be\/([\w-]{6,})/],
  };
  for (const re of patterns[provider]) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return s;
}

function TrackCell({
  title,
  artists,
  url,
}: {
  title: string | null;
  artists: string[];
  url?: string | null;
}) {
  if (!title) return <span className="text-neutral-600">no match</span>;
  const inner = (
    <>
      <div className="truncate text-sm">{title}</div>
      <div className="truncate text-xs text-neutral-500">{artists.join(", ")}</div>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block min-w-0 hover:underline">
      {inner}
    </a>
  ) : (
    <div className="min-w-0">{inner}</div>
  );
}

function ReviewRow({
  item,
  targetProvider,
  onAction,
}: {
  item: JobItem;
  targetProvider: MusicProvider;
  onAction: (
    itemId: string,
    action: string,
    targetTrackId?: string
  ) => Promise<void>;
}) {
  const [manualId, setManualId] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: string, targetTrackId?: string) => {
    setBusy(true);
    try {
      await onAction(item.id, action, targetTrackId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <TrackCell title={item.title} artists={item.artists} url={item.sourceUrl} />
      <span className="text-neutral-600">→</span>
      <div className="flex min-w-0 items-center gap-2">
        <TrackCell
          title={item.targetTitle}
          artists={item.targetArtists}
          url={item.targetUrl}
        />
        <ConfidenceBadge confidence={item.confidence} />
        <StatusBadge status={item.status} />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        {busy ? (
          <Spinner />
        ) : (
          <>
            <div className="flex gap-1.5">
              {item.status === "needs_review" && item.targetTrackId && (
                <button
                  onClick={() => void run("accept")}
                  className="rounded bg-emerald-600/80 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Accept
                </button>
              )}
              {item.status !== "skipped" ? (
                <button
                  onClick={() => void run("skip")}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Skip
                </button>
              ) : (
                <button
                  onClick={() => void run("reset")}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Undo skip
                </button>
              )}
            </div>
            {item.candidates.length > 1 && item.status !== "skipped" && (
              <select
                className="max-w-56 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs"
                value=""
                onChange={(e) => {
                  if (e.target.value) void run("choose", e.target.value);
                }}
              >
                <option value="">other candidates…</option>
                {(item.candidates as Candidate[]).map((c) => (
                  <option
                    key={c.track.providerTrackId}
                    value={c.track.providerTrackId}
                  >
                    {c.track.title} — {c.track.artists.join(", ")} ({c.confidence})
                  </option>
                ))}
              </select>
            )}
            {(item.status === "unmatched" || item.status === "needs_review") && (
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualId.trim()) {
                    void run("manual", extractTrackId(manualId, targetProvider));
                    setManualId("");
                  }
                }}
              >
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="paste track URL/id"
                  className="w-40 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs outline-none focus:border-sky-500"
                />
                <button className="rounded border border-neutral-700 px-1.5 py-1 text-xs text-neutral-400 hover:text-neutral-200">
                  Set
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TransferJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const withItems = true;
      const res = await api<{ job: Job; items?: JobItem[] }>(
        `/api/transfer/jobs/${id}${withItems ? "?items=1" : ""}`
      );
      setJob(res.job);
      if (res.items) setItems(res.items);
      return res.job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const j = await load();
      if (stopped) return;
      if (j && (j.status === "matching" || j.status === "executing")) {
        pollRef.current = setTimeout(tick, 2000);
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [load]);

  const itemAction = async (
    itemId: string,
    action: string,
    targetTrackId?: string
  ) => {
    try {
      const res = await api<{ item: JobItem }>(
        `/api/transfer/jobs/${id}/items/${itemId}`,
        { method: "PATCH", body: JSON.stringify({ action, targetTrackId }) }
      );
      setItems((prev) => prev.map((i) => (i.id === itemId ? res.item : i)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const execute = async () => {
    setActing(true);
    setError(null);
    try {
      await api(`/api/transfer/jobs/${id}/execute`, { method: "POST" });
      await load();
      pollRef.current = setTimeout(async function tick() {
        const j = await load();
        if (j && j.status === "executing") {
          pollRef.current = setTimeout(tick, 2000);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setActing(false);
    }
  };

  const cancel = async () => {
    if (!confirm("Cancel this transfer?")) return;
    try {
      await api(`/api/transfer/jobs/${id}/cancel`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  if (!job) return error ? <ErrorBanner message={error} /> : <Spinner />;

  const needsReview = items.filter((i) => i.status === "needs_review");
  const unmatched = items.filter((i) => i.status === "unmatched");
  const autoMatched = items.filter(
    (i) => i.status === "auto_matched" || i.status === "accepted"
  );
  const skipped = items.filter((i) => i.status === "skipped");
  const failed = items.filter((i) => i.status === "failed");
  const willAdd = autoMatched.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProviderTag provider={job.sourceProvider} />
          <span className="text-neutral-600">→</span>
          <ProviderTag provider={job.targetProvider} />
          <h1 className="text-lg font-semibold">{job.sourcePlaylistName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={job.status} />
          {["matching", "needs_review", "executing"].includes(job.status) && (
            <button
              onClick={() => void cancel()}
              className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-red-500/50 hover:text-red-400"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {job.errorMessage && job.status !== "failed" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {job.errorMessage}
        </div>
      )}

      {job.status === "matching" && (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-neutral-300">
              {job.phase === "fetching_source"
                ? "Fetching source playlist…"
                : `Matching tracks… ${job.processedItems}/${job.totalItems}`}
            </span>
          </div>
          <ProgressBar value={job.processedItems} max={job.totalItems || 1} />
        </section>
      )}

      {job.status === "executing" && (
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-neutral-300">
              {job.phase === "creating_playlist"
                ? "Creating target playlist…"
                : job.phase === "reading_target"
                  ? "Reading target playlist…"
                  : `Adding tracks… ${job.addedItems} added`}
            </span>
          </div>
          <ProgressBar value={job.processedItems} max={willAdd || 1} />
        </section>
      )}

      {job.status === "failed" && (
        <ErrorBanner message={job.errorMessage ?? "Transfer failed"} />
      )}

      {["completed", "partial"].includes(job.status) && (
        <section className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="font-medium">
            {job.status === "completed" ? "Transfer complete" : "Transfer finished with issues"}
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-2xl font-semibold text-emerald-400">
                {job.addedItems}
              </div>
              <div className="text-neutral-500">added</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-300">
                {job.skippedItems}
              </div>
              <div className="text-neutral-500">skipped</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-400">
                {job.failedItems}
              </div>
              <div className="text-neutral-500">failed</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-300">
                {job.totalItems}
              </div>
              <div className="text-neutral-500">source tracks</div>
            </div>
          </div>
          {job.targetPlaylistUrl && (
            <a
              href={job.targetPlaylistUrl}
              target="_blank"
              rel="noreferrer"
              className="w-fit rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Open playlist ↗
            </a>
          )}
          {failed.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-red-400">
                {failed.length} failed tracks
              </summary>
              <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-400">
                {failed.map((i) => (
                  <div key={i.id}>
                    {i.title} — {i.artists.join(", ")}{" "}
                    <span className="text-xs text-red-400/70">{i.errorMessage}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-neutral-400">
                {skipped.length} skipped tracks
              </summary>
              <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-500">
                {skipped.map((i) => (
                  <div key={i.id}>
                    {i.title} — {i.artists.join(", ")}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {job.status === "needs_review" && (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="flex gap-5 text-sm">
              <span className="text-emerald-400">{willAdd} matched</span>
              <span className="text-amber-400">{needsReview.length} need review</span>
              <span className="text-red-400">{unmatched.length} unmatched</span>
              <span className="text-neutral-500">{skipped.length} skipped</span>
            </div>
            <button
              onClick={() => void execute()}
              disabled={acting || willAdd === 0}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {acting
                ? "Starting…"
                : `Transfer ${willAdd} track${willAdd === 1 ? "" : "s"} →`}
            </button>
          </section>

          {needsReview.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-amber-400">
                Needs review ({needsReview.length})
              </h2>
              {needsReview.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  targetProvider={job.targetProvider}
                  onAction={itemAction}
                />
              ))}
            </section>
          )}

          {unmatched.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-red-400">
                Unmatched ({unmatched.length}) — will be skipped unless fixed
              </h2>
              {unmatched.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  targetProvider={job.targetProvider}
                  onAction={itemAction}
                />
              ))}
            </section>
          )}

          <details open={autoMatched.length <= 10}>
            <summary className="cursor-pointer text-sm font-medium text-emerald-400">
              Matched ({autoMatched.length})
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {autoMatched.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  targetProvider={job.targetProvider}
                  onAction={itemAction}
                />
              ))}
            </div>
          </details>

          {skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-neutral-400">
                Skipped ({skipped.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {skipped.map((item) => (
                  <ReviewRow
                    key={item.id}
                    item={item}
                    targetProvider={job.targetProvider}
                    onAction={itemAction}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
