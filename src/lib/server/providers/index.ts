import type { OAuthProviderId } from "../../integrations/catalog";
import { mercadoPagoOptions } from "../env";
import { google } from "./google";
import { mercadoPagoAdapter } from "./mercadopago";
import { notion } from "./notion";
import type { OAuthAdapter } from "./types";

export function adapterFor(id: OAuthProviderId, env: NodeJS.ProcessEnv = process.env): OAuthAdapter {
  if (id === "google") return google;
  if (id === "notion") return notion;
  return mercadoPagoAdapter(mercadoPagoOptions(env));
}

export { google, notion, mercadoPagoAdapter };
export * from "./types";
