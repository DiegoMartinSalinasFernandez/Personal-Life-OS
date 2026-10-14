"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServerProviderState } from "./catalog";

export interface StatusResponse {
  core: { ok: boolean; missing: string[]; problems: string[]; store: string };
  providers: ServerProviderState[];
  limit?: number;
}

export type ServerStatus = { state: "loading" } | { state: "unavailable"; message: string } | { state: "ready"; data: StatusResponse };

/** Talks to the integration API. No tokens ever reach the browser — only statuses. */
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>({ state: "loading" });
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 404) return setStatus({ state: "unavailable", message: "This deployment has no server API (static hosting). OAuth integrations need the Node server (npm start)." });
      const data = (await res.json()) as StatusResponse;
      setStatus({ state: "ready", data });
    } catch {
      setStatus({ state: "unavailable", message: "The integration server could not be reached." });
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { status, refresh };
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-life-os": "1", ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError("network", "The integration server could not be reached.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "error", body.message ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  sync: <T>(provider: string, body: Record<string, unknown>) => request<T>(`/api/integrations/${provider}/sync`, { method: "POST", body: JSON.stringify(body) }),
  resources: <T>(provider: string) => request<{ items: T[] }>(`/api/integrations/${provider}/resources`),
  disconnect: (provider: string) => request<{ ok: boolean; revoked: boolean; wasConnected: boolean }>(`/api/integrations/${provider}/disconnect`, { method: "POST", body: "{}" }),
  connectUrl: (provider: string, localActive = 0) => `/api/integrations/${provider}/connect?localActive=${localActive}`,
};

export const CALLBACK_ERRORS: Record<string, string> = {
  config: "This integration isn't configured on the server yet. See the developer setup guide.",
  state: "The authorization response couldn't be verified (expired or tampered). Please try again.",
  denied: "Authorization was cancelled at the provider. Nothing was connected.",
  exchange: "The provider didn't accept the authorization code. Nothing was connected.",
  scope: "Some required read permissions weren't granted, so nothing was connected. Try again and allow all requested access.",
  verify: "The connection couldn't be verified with the provider, so it wasn't saved.",
  limit: "You already have 3 financial providers connected. Disconnect one first.",
};
