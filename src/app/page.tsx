"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  PROVIDER_LABELS,
  type Job,
  type ProviderStatus,
} from "@/lib/types";
import {
  ErrorBanner,
  ProviderTag,
  Spinner,
  StatusBadge,
} from "@/components/ui";

function ConnectBanner() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const error = params.get("error");
  if (connected) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        {PROVIDER_LABELS[connected as keyof typeof PROVIDER_LABELS] ?? connected}{" "}
        connected successfully.
      </div>
    );
  }
  if (error) return <ErrorBanner message={decodeURIComponent(error)} />;
  return null;
}

function ProviderCard({
  status,
  onDisconnect,
}: {
  status: ProviderStatus;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-center justify-between">
        <ProviderTag provider={status.provider} />
        {status.connected ? (
          <span className="text-xs text-emerald-400">● connected</span>
        ) : (
          <span className="text-xs text-neutral-500">○ not connected</span>
        )}
      </div>
      <div className="min-h-5 text-sm text-neutral-400">
        {status.connected
          ? status.displayName
          : status.configured
            ? "Ready to connect"
            : "Add API credentials to .env first"}
      </div>
      {status.connected ? (
        <button
          onClick={onDisconnect}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
        >
          Disconnect
        </button>
      ) : status.configured ? (
        <a
          href={`/api/auth/${status.provider}`}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-sky-500"
        >
          Connect
        </a>
      ) : (
        <span className="cursor-not-allowed rounded-lg bg-neutral-800 px-3 py-1.5 text-center text-sm font-medium text-neutral-500">
          Connect
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ providers: ProviderStatus[] }>("/api/providers"),
      api<{ jobs: Job[] }>("/api/transfer/jobs"),
    ])
      .then(([p, j]) => {
        setProviders(p.providers);
        setJobs(j.jobs.slice(0, 5));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const disconnect = async (provider: string) => {
    if (!confirm(`Disconnect ${provider} and delete its tokens?`)) return;
    await api(`/api/providers/${provider}`, { method: "DELETE" });
    void load();
  };

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <ConnectBanner />
      </Suspense>
      {error && <ErrorBanner message={error} />}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Connected accounts</h1>
          <Link
            href="/transfer/new"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            New transfer →
          </Link>
        </div>
        {providers === null ? (
          <Spinner />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {providers.map((p) => (
              <ProviderCard
                key={p.provider}
                status={p}
                onDisconnect={() => void disconnect(p.provider)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Recent transfers</h2>
        {jobs === null ? (
          <Spinner />
        ) : jobs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No transfers yet. Connect two providers and start one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/transfer/${job.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
              >
                <div className="flex items-center gap-3 text-sm">
                  <ProviderTag provider={job.sourceProvider} />
                  <span className="text-neutral-600">→</span>
                  <ProviderTag provider={job.targetProvider} />
                  <span className="text-neutral-300">{job.sourcePlaylistName}</span>
                </div>
                <StatusBadge status={job.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
