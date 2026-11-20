import { readProviderConfiguration, type ManagedProviderId } from "./config-store";

/** Provider tokens are decrypted on host only; never accept runtime URLs from browsers. */
export type PlanProvider = ManagedProviderId | "ollama";
export type PlanMessage = { role: "system" | "user"; content: string };
export type PlanCompletion = { provider: PlanProvider; model: string; content: string };
type Config = { provider: PlanProvider; url: string; model: string; token?: string; priority: number };
const FIXED_URLS: Record<ManagedProviderId, string> = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  moonshot: "https://api.moonshot.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};

async function configurations(): Promise<Config[]> {
  const vault = await readProviderConfiguration();
  const paidAllowed = vault.allowPaid || process.env.AI_ALLOW_PAID_CALLS === "1";
  const paid: Config[] = [];
  if (paidAllowed) {
    for (const item of vault.accounts) {
      if (!item.enabled || !item.key || !item.model) continue;
      paid.push({ provider: item.provider, url: FIXED_URLS[item.provider],
        model: item.model, token: item.key, priority: item.priority });
    }
    const configured = new Set(paid.map(x=>x.provider));
    for (const provider of ["nvidia", "openai", "moonshot", "deepseek", "anthropic"] as const) {
      if (configured.has(provider)) continue;
      const keys: Record<ManagedProviderId, string> = {
        nvidia: "NVIDIA_API_KEY", openai: "OPENAI_API_KEY", moonshot: "MOONSHOT_API_KEY",
        deepseek: "DEEPSEEK_API_KEY", anthropic: "ANTHROPIC_API_KEY",
      };
      const envModel: Record<ManagedProviderId, string> = {
        nvidia: "NVIDIA_MODEL", openai: "OPENAI_MODEL", moonshot: "MOONSHOT_MODEL",
        deepseek: "DEEPSEEK_MODEL", anthropic: "ANTHROPIC_MODEL",
      };
      const key = process.env[keys[provider]];
      const model = process.env[envModel[provider]];
      if (key && model) paid.push({ provider, url: FIXED_URLS[provider],
        token: key, model, priority: 50 });
    }
  }
  const base = (process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434").replace(/\/$/, "");
  paid.push({ provider: "ollama", url: base + "/api/chat",
    model: process.env.OLLAMA_MODEL || "qwen2.5:1.5b", priority: 999 });
  return paid.sort((a,b)=>a.priority-b.priority);
}

export async function supportedProviders(): Promise<PlanProvider[]> {
  return (await configurations()).map(p=>p.provider);
}
export async function providerOrder(preferred: unknown): Promise<Config[]> {
  const configs = await configurations();
  if (typeof preferred === "string" && configs.some(p=>p.provider===preferred)) {
    return [...configs.filter(p=>p.provider===preferred),...configs.filter(p=>p.provider!==preferred)];
  }
  return configs;
}

function responseContent(raw: unknown, provider: PlanProvider): string | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (provider === "anthropic") {
    const blocks = data.content;
    const first = Array.isArray(blocks) ? blocks.find(x=>x?.type==="text") : null;
    return first && typeof first.text === "string" ? first.text : null;
  }
  const message = provider === "ollama" ? data.message :
    Array.isArray(data.choices) && data.choices.length ? data.choices[0]?.message : null;
  const content = message && typeof message === "object" ? message.content : null;
  return typeof content === "string" && content.length ? content : null;
}

async function callProvider(config: Config, messages: PlanMessage[], format: unknown): Promise<PlanCompletion> {
  const { provider, model, url, token } = config;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: unknown;
  if (provider === "anthropic") {
    headers["x-api-key"] = token || "";
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: 1024,
      system: messages.filter(m=>m.role==="system").map(m=>m.content).join("\n"),
      messages: messages.filter(m=>m.role!=="system") };
  } else if (provider === "ollama") {
    body = { model, messages, stream: false, format, options: { temperature: 0 } };
  } else {
    headers.Authorization = "Bearer " + (token || "");
    // Model-specific temperature fields are intentionally omitted.
    body = { model, messages, stream: false };
  }
  const response = await fetch(url, {
    method: "POST", headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(provider + " HTTP " + response.status);
  const raw: unknown = await response.json();
  const content = responseContent(raw, provider);
  if (!content) throw new Error(provider + " returned no text");
  let parsed: unknown;
  try { parsed = JSON.parse(content) as unknown; }
  catch { throw new Error(provider + " returned malformed JSON"); }
  if (!parsed || typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).summary !== "string" ||
      !Array.isArray((parsed as Record<string, unknown>).commands)) {
    throw new Error(provider + " returned invalid editing plan schema");
  }
  return { provider, model, content };
}

export async function createRoutedPlan(params: {
  messages: PlanMessage[];
  format: unknown;
  preferred?: unknown;
}): Promise<PlanCompletion> {
  const order = await providerOrder(params.preferred);
  for (const provider of order) {
    try { return await callProvider(provider, params.messages, params.format); }
    catch (error) {
      console.warn("[ai-router] provider failed:", provider.provider,
        error instanceof Error ? error.message : "unknown error");
    }
  }
  throw new Error("Nenhum provedor de IA configurado respondeu com um plano JSON válido.");
}
