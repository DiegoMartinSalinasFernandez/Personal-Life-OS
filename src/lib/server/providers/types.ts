export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms, or null if the provider didn't say */
  expiresAt: number | null;
  scopes: string[];
  /** Provider-specific extras needed later (e.g. Mercado Pago user_id, Notion workspace). */
  extra: Record<string, string>;
}

export type ProviderErrorCode = "not_connected" | "invalid_grant" | "unauthorized" | "insufficient_scope" | "rate_limited" | "provider_error" | "network" | "bad_response";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string, public status = 0) {
    super(message);
  }
}

export interface OAuthCtx {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthAdapter {
  id: string;
  usesPkce: boolean;
  scopes: string[];
  buildAuthUrl(ctx: OAuthCtx & { state: string; codeChallenge: string | null }): string;
  exchangeCode(ctx: OAuthCtx & { code: string; codeVerifier: string | null }): Promise<TokenSet>;
  refresh?(ctx: OAuthCtx & { tokens: TokenSet }): Promise<TokenSet>;
  /** Confirms the token works and identifies the account. Required before "Connected". */
  verify(tokens: TokenSet): Promise<{ externalAccountId: string; label: string }>;
  /** Best-effort revocation at the provider. Returns false when the provider has no revocation endpoint. */
  revoke?(ctx: OAuthCtx & { tokens: TokenSet }): Promise<boolean>;
}

/** fetch wrapper that maps HTTP failures to ProviderError without leaking bodies into logs. */
export async function call(url: string, init: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ProviderError("network", "The provider could not be reached");
  }
  const text = await res.text();
  let body: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = String(body?.error ?? body?.code ?? "");
    if (err === "invalid_grant") throw new ProviderError("invalid_grant", "Authorization is no longer valid", res.status);
    if (res.status === 401) throw new ProviderError("unauthorized", "The provider rejected the access token", res.status);
    if (res.status === 403) throw new ProviderError("insufficient_scope", "The provider denied access to this resource", res.status);
    if (res.status === 429) throw new ProviderError("rate_limited", "The provider is rate limiting requests", res.status);
    throw new ProviderError("provider_error", `Provider returned HTTP ${res.status}`, res.status);
  }
  if (body === null && text) throw new ProviderError("bad_response", "Unexpected response from the provider", res.status);
  return body;
}

export const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
