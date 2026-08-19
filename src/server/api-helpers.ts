import { NextResponse } from "next/server";
import { isMusicProvider, type MusicProvider } from "@/server/config";
import { NotConnectedError } from "@/server/auth/tokens";
import { HttpError } from "@/server/http";

export function parseProvider(value: string): MusicProvider {
  if (!isMusicProvider(value)) {
    throw new ApiError(400, `Unknown provider: ${value}`);
  }
  return value;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof NotConnectedError) {
    return NextResponse.json(
      { error: `${err.provider} is not connected`, notConnected: err.provider },
      { status: 401 }
    );
  }
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: `Provider API error: ${err.message}` },
      { status: 502 }
    );
  }
  const message = err instanceof Error ? err.message : "Internal error";
  console.error("API error:", err);
  return NextResponse.json({ error: message }, { status: 500 });
}
