"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  PROVIDER_LABELS,
  type Job,
  type MusicProvider,
  type Playlist,
  type ProviderStatus,
} from "@/lib/types";
import { ErrorBanner, ProviderTag, Spinner } from "@/components/ui";

function PlaylistGrid({
  playlists,
  selectedId,
  onSelect,
}: {
  playlists: Playlist[];
  selectedId?: string;
  onSelect: (p: Playlist) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  return (
    <div className="flex flex-col gap-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter playlists…"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
      />
      <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
        {filtered.map((p) => (
          <button
            key={p.providerPlaylistId}
            onClick={() => onSelect(p)}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left ${
              selectedId === p.providerPlaylistId
                ? "border-sky-500 bg-sky-500/10"
                : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-600"
            }`}
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded bg-neutral-800 text-neutral-600">
                ♪
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-xs text-neutral-500">
                {p.trackCount != null ? `${p.trackCount} tracks` : ""}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-neutral-500">No playlists found.</p>
        )}
      </div>
    </div>
  );
}

export default function NewTransfer() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sourceProvider, setSourceProvider] = useState<MusicProvider | null>(null);
  const [sourcePlaylist, setSourcePlaylist] = useState<Playlist | null>(null);
  const [targetProvider, setTargetProvider] = useState<MusicProvider | null>(null);
  const [mode, setMode] = useState<"create_new" | "append">("create_new");
  const [newName, setNewName] = useState("");
  const [targetPlaylist, setTargetPlaylist] = useState<Playlist | null>(null);

  const [sourcePlaylists, setSourcePlaylists] = useState<Playlist[] | null>(null);
  const [targetPlaylists, setTargetPlaylists] = useState<Playlist[] | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api<{ providers: ProviderStatus[] }>("/api/providers")
      .then((r) => setProviders(r.providers))
      .catch((e) => setError(e.message));
  }, []);

  const connected = useMemo(
    () => (providers ?? []).filter((p) => p.connected),
    [providers]
  );

  useEffect(() => {
    if (!sourceProvider) return;
    api<{ playlists: Playlist[] }>(`/api/playlists?provider=${sourceProvider}`)
      .then((r) => setSourcePlaylists(r.playlists))
      .catch((e) => setError(e.message));
  }, [sourceProvider]);

  useEffect(() => {
    if (!targetProvider || mode !== "append") return;
    api<{ playlists: Playlist[] }>(`/api/playlists?provider=${targetProvider}`)
      .then((r) => setTargetPlaylists(r.playlists))
      .catch((e) => setError(e.message));
  }, [targetProvider, mode]);

  const pickSourceProvider = (p: MusicProvider) => {
    if (p === sourceProvider) return;
    setSourceProvider(p);
    setSourcePlaylist(null);
    setSourcePlaylists(null);
  };

  const pickTargetProvider = (p: MusicProvider) => {
    if (p === targetProvider) return;
    setTargetProvider(p);
    setTargetPlaylist(null);
    setTargetPlaylists(null);
  };

  const canStart =
    sourceProvider &&
    sourcePlaylist &&
    targetProvider &&
    (mode === "create_new" || targetPlaylist) &&
    !starting;

  const start = async () => {
    if (!canStart || !sourceProvider || !sourcePlaylist || !targetProvider) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ job: Job }>("/api/transfer/jobs", {
        method: "POST",
        body: JSON.stringify({
          sourceProvider,
          sourcePlaylistId: sourcePlaylist.providerPlaylistId,
          sourcePlaylistName: sourcePlaylist.name,
          targetProvider,
          mode,
          targetPlaylistId:
            mode === "append" ? targetPlaylist?.providerPlaylistId : undefined,
          targetPlaylistName:
            mode === "create_new" && newName.trim() ? newName.trim() : undefined,
        }),
      });
      router.push(`/transfer/${res.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start transfer");
      setStarting(false);
    }
  };

  if (providers === null) return <Spinner />;

  if (connected.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">New transfer</h1>
        <p className="text-sm text-neutral-400">
          You need at least two connected providers to transfer a playlist. Connect
          them on the dashboard first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">New transfer</h1>
      {error && <ErrorBanner message={error} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-neutral-300">1. Source</h2>
        <div className="flex gap-2">
          {connected.map((p) => (
            <button
              key={p.provider}
              onClick={() => pickSourceProvider(p.provider)}
              className={`rounded-lg border px-4 py-2 ${
                sourceProvider === p.provider
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              <ProviderTag provider={p.provider} />
            </button>
          ))}
        </div>
        {sourceProvider &&
          (sourcePlaylists === null ? (
            <Spinner />
          ) : (
            <PlaylistGrid
              playlists={sourcePlaylists}
              selectedId={sourcePlaylist?.providerPlaylistId}
              onSelect={(p) => {
                setSourcePlaylist(p);
                if (!newName) setNewName(p.name);
              }}
            />
          ))}
      </section>

      {sourcePlaylist && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-neutral-300">2. Target</h2>
          <div className="flex gap-2">
            {connected
              .filter((p) => p.provider !== sourceProvider)
              .map((p) => (
                <button
                  key={p.provider}
                  onClick={() => pickTargetProvider(p.provider)}
                  className={`rounded-lg border px-4 py-2 ${
                    targetProvider === p.provider
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  <ProviderTag provider={p.provider} />
                </button>
              ))}
          </div>

          {targetProvider && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "create_new"}
                    onChange={() => setMode("create_new")}
                  />
                  Create new playlist
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                  />
                  Add to existing playlist
                </label>
              </div>

              {mode === "create_new" ? (
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={sourcePlaylist.name}
                  className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              ) : targetPlaylists === null ? (
                <Spinner />
              ) : (
                <PlaylistGrid
                  playlists={targetPlaylists}
                  selectedId={targetPlaylist?.providerPlaylistId}
                  onSelect={setTargetPlaylist}
                />
              )}
            </div>
          )}
        </section>
      )}

      {sourcePlaylist && targetProvider && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-neutral-300">3. Start</h2>
          <p className="text-sm text-neutral-400">
            Transfer <span className="text-neutral-200">{sourcePlaylist.name}</span>{" "}
            ({sourcePlaylist.trackCount ?? "?"} tracks) from{" "}
            {PROVIDER_LABELS[sourceProvider!]} to {PROVIDER_LABELS[targetProvider]}.
            You&apos;ll review the matches before anything is written.
          </p>
          {targetProvider === "youtube" && (
            <p className="text-xs text-amber-400/80">
              YouTube API quota allows ~100 track searches per day. Larger playlists
              will partially match today and can be re-run tomorrow.
            </p>
          )}
          <button
            onClick={() => void start()}
            disabled={!canStart}
            className="w-fit rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {starting ? "Starting…" : "Match tracks →"}
          </button>
        </section>
      )}
    </div>
  );
}
