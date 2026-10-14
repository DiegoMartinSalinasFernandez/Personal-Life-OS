import { handleDisconnect } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  return handleDisconnect(req, (await ctx.params).provider);
}
