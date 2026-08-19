import { vi } from "vitest";
import type { ProviderCtx } from "@/server/providers/types";

export type FetchCall = { url: string; init?: RequestInit };

export function installFetchMock() {
  const calls: FetchCall[] = [];
  const routes: Array<{
    test: RegExp;
    reply: (url: URL, init?: RequestInit) => unknown;
    status?: number;
  }> = [];

  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => r.test.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: `no mock for ${url}` }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(route.reply(new URL(url), init)), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  vi.stubGlobal("fetch", fn);

  return {
    calls,
    on(test: RegExp, reply: (url: URL, init?: RequestInit) => unknown, status?: number) {
      routes.push({ test, reply, status });
    },
    requestBody(index: number): unknown {
      return JSON.parse(String(calls[index]?.init?.body ?? "null"));
    },
  };
}

export const fakeCtx: ProviderCtx = {
  accountId: "acc1",
  accessToken: "token",
  providerUserId: "user1",
  meta: {},
};
