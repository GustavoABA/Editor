import { authorizeSync } from "@/lan-sync/server";
import {
  PROVIDER_IDS, readProviderConfiguration, writeProviderConfiguration,
  publicProviderConfiguration, type ManagedProviderId, type ProviderAccount,
} from "@/ai/config-store";
import { testProviderConnection } from "@/ai/plan-router";

export const runtime = "nodejs";
const MAX_BODY = 16 * 1024;

function denied(request: Request) { return authorizeSync(request); }
function validProvider(value: unknown): value is ManagedProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as ManagedProviderId);
}
export async function GET(request: Request) {
  const auth = denied(request);
  if (auth) return auth;
  try { return Response.json(publicProviderConfiguration(await readProviderConfiguration())); }
  catch { return Response.json({ error: "Failed to read provider vault" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  const auth = denied(request);
  if (auth) return auth;
  const len = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(len) || len <= 0 || len > MAX_BODY) return Response.json({ error: "Invalid request size" }, { status: 413 });
  const data: unknown = await request.json().catch(() => null);
  if (!data || typeof data !== "object") return Response.json({ error: "Invalid provider" }, { status: 400 });
  const input = data as Record<string, unknown>;
  try {
    const current = await readProviderConfiguration();
    if (input.mode === "allow-paid") {
      if (typeof input.allowPaid !== "boolean") return Response.json({ error: "Invalid opt-in" }, { status: 400 });
      current.allowPaid = input.allowPaid;
    } else {
      if (!validProvider(input.provider) || typeof input.model !== "string" ||
          input.model.length < 1 || input.model.length > 150 ||
          typeof input.enabled !== "boolean" ||
          typeof input.priority !== "number" || !Number.isInteger(input.priority) ||
          input.priority < 0 || input.priority > 100 ||
          (input.key !== undefined && (typeof input.key !== "string" || input.key.length > 1000))) {
        return Response.json({ error: "Invalid provider settings" }, { status: 400 });
      }
      const old = current.accounts.find(a => a.provider === input.provider);
      const key = typeof input.key === "string" && input.key.length ? input.key.trim() : old?.key || "";
      if (!key) return Response.json({ error: "Configure um token para este provedor" }, { status: 400 });
      const account: ProviderAccount = {
        provider: input.provider, key, model: input.model.trim(), enabled: input.enabled,
        priority: input.priority,
      };
      current.accounts = [...current.accounts.filter(a => a.provider !== account.provider), account];
    }
    await writeProviderConfiguration(current);
    return Response.json(publicProviderConfiguration(current));
  } catch {
    return Response.json({ error: "Could not save provider configuration" }, { status: 500 });
  }
}

/** An explicit UI action: verify the saved key and model without exposing either. */
export async function POST(request: Request) {
  const auth = denied(request);
  if (auth) return auth;
  const input: unknown = await request.json().catch(() => null);
  const provider = input && typeof input === "object" ? (input as Record<string, unknown>).provider : null;
  if (!validProvider(provider)) return Response.json({ error: "Invalid provider" }, { status: 400 });
  try {
    const result = await testProviderConnection(provider);
    return Response.json({ ok: true, provider: result.provider, model: result.model });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Provider connection test failed",
    }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const auth = denied(request);
  if (auth) return auth;
  const input: unknown = await request.json().catch(() => null);
  const provider = input && typeof input === "object" ? (input as Record<string, unknown>).provider : null;
  if (!validProvider(provider)) return Response.json({ error: "Invalid provider" }, { status: 400 });
  try {
    const config = await readProviderConfiguration();
    config.accounts = config.accounts.filter(a => a.provider !== provider);
    await writeProviderConfiguration(config);
    return Response.json(publicProviderConfiguration(config));
  } catch { return Response.json({ error: "Could not remove provider" }, { status: 500 }); }
}
