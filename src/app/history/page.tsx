"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { type Job } from "@/lib/types";
import { ErrorBanner, ProviderTag, Spinner, StatusBadge } from "@/components/ui";

export default function History() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ jobs: Job[] }>("/api/transfer/jobs")
      .then((r) => setJobs(r.jobs))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this transfer from history?")) return;
    await api(`/api/transfer/jobs/${id}`, { method: "DELETE" });
    load();
  };

  if (error) return <ErrorBanner message={error} />;
  if (jobs === null) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Transfer history</h1>
      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">No transfers yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3"
            >
              <Link
                href={`/transfer/${job.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-sm hover:opacity-80"
              >
                <ProviderTag provider={job.sourceProvider} />
                <span className="text-neutral-600">→</span>
                <ProviderTag provider={job.targetProvider} />
                <span className="truncate text-neutral-300">
                  {job.sourcePlaylistName}
                </span>
                <span className="text-xs text-neutral-600">
                  {new Date(job.createdAt).toLocaleString()}
                </span>
              </Link>
              <div className="flex items-center gap-3">
                {["completed", "partial"].includes(job.status) && (
                  <span className="text-xs text-neutral-500">
                    {job.addedItems}/{job.totalItems} added
                  </span>
                )}
                <StatusBadge status={job.status} />
                <button
                  onClick={() => void remove(job.id)}
                  className="text-xs text-neutral-600 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
