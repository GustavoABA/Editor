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
    if (input.mode === "selection") {
      const selected = input.preferred;
      if (selected !== "auto" && selected !== "ollama" && selected !== "local" && !validProvider(selected)) return Response.json({ error: "Provedor inválido" }, { status: 400 });
      if (validProvider(selected) && (!current.allowPaid || !current.accounts.some(a => a.provider === selected && a.enabled && a.key && a.model && (typeof input.preferredModel !== "string" || !input.preferredModel || a.model === input.preferredModel)))) return Response.json({ error: "Habilite e configure este provedor primeiro." }, { status: 400 });
      current.preferred = selected;
      current.preferredModel = validProvider(selected) ? (typeof input.preferredModel === "string" && input.preferredModel ? input.preferredModel : current.accounts.find(a=>a.provider===selected&&a.enabled&&a.key)?.model || "") : "";
      if (typeof input.ollamaModel === "string" && input.ollamaModel.trim().length > 0 && input.ollamaModel.length <= 150) current.ollamaModel = input.ollamaModel.trim();
    } else if (input.mode === "allow-paid") {
      if (typeof input.allowPaid !== "boolean") return Response.json({ error: "Invalid opt-in" }, { status: 400 });
      current.allowPaid = input.allowPaid;
    } else {
      if (!validProvider(input.provider) || typeof input.model !== "string" ||
          input.model.trim().length < 1 || input.model.length > 150 ||
          typeof input.enabled !== "boolean" ||
          typeof input.priority !== "number" || !Number.isInteger(input.priority) ||
          input.priority < 0 || input.priority > 100 ||
          (input.key !== undefined && (typeof input.key !== "string" || input.key.length > 1000))) {
        return Response.json({ error: "Invalid provider settings" }, { status: 400 });
      }
      const old = current.accounts.find(a => a.provider === input.provider && a.model === (input.model as string).trim()) || current.accounts.find(a => a.provider === input.provider);
      const key = typeof input.key === "string" && input.key.trim() ? input.key.trim() : old?.key || "";
      if (!key) return Response.json({ error: "Configure um token para este provedor" }, { status: 400 });
      const account: ProviderAccount = {
        provider: input.provider, key, model: input.model.trim(), enabled: input.enabled,
        priority: input.priority,
      };
      current.accounts = [...current.accounts.filter(a => a.provider !== account.provider || a.model !== account.model), account];
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
    const fields = input as Record<string, unknown>;
    if (fields.mode === "models") {
      const config = await readProviderConfiguration();
      const key = typeof fields.key === "string" && fields.key.trim() && fields.key.length <= 1000 ? fields.key.trim() : config.accounts.find(a=>a.provider === provider)?.key;
      if (!key) return Response.json({ error: "Informe a API Key para buscar os modelos." }, { status: 400 });
      const urls: Record<ManagedProviderId,string> = { nvidia: "https://integrate.api.nvidia.com/v1/models", openai: "https://api.openai.com/v1/models", moonshot: "https://api.moonshot.ai/v1/models", deepseek: "https://api.deepseek.com/models", anthropic: "https://api.anthropic.com/v1/models" };
      const headers: Record<string,string> = provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: "Bearer " + key };
      const response = await fetch(urls[provider], { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw Error("Catálogo do provedor retornou HTTP " + response.status + ". Verifique a chave.");
      const data = await response.json() as { data?: Array<{ id?: unknown }> };
      const models = [...new Set((Array.isArray(data.data) ? data.data : []).flatMap(m => typeof m.id === "string" ? [m.id] : []))].sort().slice(0, 2000);
      return Response.json({ models, provider });
    }
    const result = await testProviderConnection(provider, typeof fields.model === "string" ? fields.model : undefined);
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
    const model = (input as Record<string, unknown>).model;
    config.accounts = config.accounts.filter(a => a.provider !== provider || (typeof model === "string" && a.model !== model));
    if(config.preferred === provider && (!config.accounts.some(a=>a.provider===provider&&a.model===config.preferredModel))) {config.preferred="auto";config.preferredModel="";}
    await writeProviderConfiguration(config);
    return Response.json(publicProviderConfiguration(config));
  } catch { return Response.json({ error: "Could not remove provider" }, { status: 500 }); }
}
