/**
 * Server configuration. Values are read from process.env on every call (no
 * caching) and never sent to the browser — only "configured / missing names".
 */
import { loadKey } from "./crypto";
import type { OAuthProviderId } from "../integrations/catalog";

export interface CoreConfig {
  ok: boolean;
  missing: string[];
  problems: string[];
  baseUrl: string | null;
  secureCookies: boolean;
  sessionSecret: string | null;
  key: Buffer | null;
  store: "file" | "supabase";
}

function validBaseUrl(raw: string | undefined): { url: string | null; problem?: string } {
  if (!raw) return { url: null };
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return { url: null, problem: "APP_BASE_URL must use https (http is only allowed for localhost)" };
    if (u.pathname !== "/" || u.search || u.hash) return { url: null, problem: "APP_BASE_URL must be an origin without path, e.g. https://app.example.com" };
    return { url: u.origin };
  } catch {
    return { url: null, problem: "APP_BASE_URL is not a valid URL" };
  }
}

export function coreConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const missing: string[] = [];
  const problems: string[] = [];
  const base = validBaseUrl(env.APP_BASE_URL);
  if (!env.APP_BASE_URL) missing.push("APP_BASE_URL");
  if (base.problem) problems.push(base.problem);
  const sessionSecret = env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? env.SESSION_SECRET : null;
  if (!env.SESSION_SECRET) missing.push("SESSION_SECRET");
  else if (!sessionSecret) problems.push("SESSION_SECRET must be at least 32 characters");
  const key = loadKey(env.INTEGRATIONS_ENCRYPTION_KEY);
  if (!env.INTEGRATIONS_ENCRYPTION_KEY) missing.push("INTEGRATIONS_ENCRYPTION_KEY");
  else if (!key) problems.push("INTEGRATIONS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)");
  const store = env.INTEGRATIONS_STORE === "supabase" ? "supabase" : "file";
  if (store === "supabase") {
    if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    ok: missing.length === 0 && problems.length === 0,
    missing,
    problems,
    baseUrl: base.url,
    secureCookies: !!base.url?.startsWith("https://"),
    sessionSecret,
    key,
    store,
  };
}

const PROVIDER_ENV: Record<OAuthProviderId, [string, string]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  mercadopago: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET"],
  notion: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
};

export interface ProviderCredentials {
  configured: boolean;
  missing: string[];
  clientId: string;
  clientSecret: string;
}

export function providerCredentials(provider: OAuthProviderId, env: NodeJS.ProcessEnv = process.env): ProviderCredentials {
  const [idKey, secretKey] = PROVIDER_ENV[provider];
  const missing = [idKey, secretKey].filter((k) => !env[k]);
  return { configured: missing.length === 0, missing, clientId: env[idKey] ?? "", clientSecret: env[secretKey] ?? "" };
}

/** Exact redirect URI to register with the provider. Built from config, never from request headers. */
export const redirectUri = (baseUrl: string, provider: OAuthProviderId) => `${baseUrl}/api/integrations/${provider}/callback`;

export const mercadoPagoOptions = (env: NodeJS.ProcessEnv = process.env) => ({
  authHost: (env.MERCADOPAGO_AUTH_HOST || "https://auth.mercadopago.com").replace(/\/$/, ""),
  usePkce: env.MERCADOPAGO_USE_PKCE !== "false",
});
