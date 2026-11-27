import { readProviderConfiguration, type ManagedProviderId } from "./config-store";

/** Provider tokens are decrypted on host only; never accept runtime URLs from browsers. */
export type PlanProvider = ManagedProviderId | "ollama" | "local";
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
    const configured = new Set(vault.accounts.map(x=>x.provider));
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
    model: vault.ollamaModel || process.env.OLLAMA_MODEL || "qwen2.5:1.5b", priority: 999 });
  const localBase = (process.env.LOCAL_AI_BASE_URL || "http://local-ai:8080/v1").replace(/\/$/, "");
  paid.push({ provider: "local", url: localBase + "/chat/completions",
    model: process.env.LOCAL_AI_MODEL || "qwen2.5-coder-0.5b-instruct-q4_k_m.gguf", priority: 1_000 });
  return paid.sort((a,b)=>a.priority-b.priority);
}

export async function supportedProviders(): Promise<PlanProvider[]> {
  return (await configurations()).map(p=>p.provider);
}
export async function providerOrder(preferred: unknown): Promise<Config[]> {
  const configs = await configurations();
  if (!preferred || preferred === "auto") preferred = (await readProviderConfiguration()).preferred;
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
    const tool = Array.isArray(blocks) ? blocks.find(x=>x?.type==="tool_use" && x.name === "return_editing_plan") : null;
    if (tool && typeof tool.input === "object" && tool.input !== null) return JSON.stringify(tool.input);
    const first = Array.isArray(blocks) ? blocks.find(x=>x?.type==="text") : null;
    return first && typeof first.text === "string" ? first.text : null;
  }
  const message = provider === "ollama" ? data.message :
    Array.isArray(data.choices) && data.choices.length ? data.choices[0]?.message : null;
  const content = message && typeof message === "object" ? message.content : null;
  return typeof content === "string" && content.length ? content : null;
}

async function callProvider(config: Config, messages: PlanMessage[], format: unknown, maxTokens = 1024): Promise<PlanCompletion> {
  const { provider, model, url, token } = config;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: unknown;
  if (provider === "anthropic") {
    headers["x-api-key"] = token || "";
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: maxTokens,
      system: messages.filter(m=>m.role==="system").map(m=>m.content).join("\n"),
      messages: messages.filter(m=>m.role!=="system"),
      tools: [{
        name: "return_editing_plan",
        description: "Return the validated OpenCut editing plan.",
        input_schema: format,
      }],
      tool_choice: { type: "tool", name: "return_editing_plan" },
    };
  } else if (provider === "ollama") {
    body = { model, messages, stream: false, format, options: { temperature: 0 } };
  } else {
    headers.Authorization = "Bearer " + (token || "");
    // JSON mode is supported by OpenAI-compatible APIs. We still validate the
    // returned plan below because individual models vary in schema support.
    // NVIDIA NIM models vary in JSON-mode support; prompt plus server-side JSON validation remains authoritative.
    body = { model, messages, stream: false, ...(provider === "nvidia" || provider === "local" ? {} : { response_format: { type: "json_object" } }), ...(provider === "openai" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }) };
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
  try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown; }
  catch { throw new Error(provider + " returned malformed JSON"); }
  if (!parsed || typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).summary !== "string" ||
      !Array.isArray((parsed as Record<string, unknown>).commands)) {
    throw new Error(provider + " returned invalid editing plan schema");
  }
  return { provider, model, content: JSON.stringify(parsed) };
}

const connectionTestFormat = {
  type: "object",
  properties: {
    summary: { type: "string" },
    commands: { type: "array", maxItems: 0 },
  },
  required: ["summary", "commands"],
  additionalProperties: false,
} as const;

/** Performs a minimal real request with a saved provider credential. */
export async function testProviderConnection(provider: ManagedProviderId): Promise<Pick<PlanCompletion, "provider" | "model">> {
  const config = (await configurations()).find((item) => item.provider === provider);
  if (!config || config.provider === "ollama") {
    throw new Error("Configure, habilite e autorize este provedor antes de testar");
  }
  const completion = await callProvider(config, [
    { role: "system", content: "Return exactly this JSON object: {\"summary\":\"ok\",\"commands\":[]}" },
    { role: "user", content: "Confirm this provider connection." },
  ], connectionTestFormat, 512);
  return { provider: completion.provider, model: completion.model };
}

export async function createRoutedPlan(params: {
  messages: PlanMessage[];
  format: unknown;
  preferred?: unknown;
  maxTokens?: number;
  validate?: (content: string) => boolean;
}): Promise<PlanCompletion> {
  const order = await providerOrder(params.preferred);
  for (const provider of order) {
    try {
      const result = await callProvider(provider, params.messages, params.format,
        Math.min(8192, Math.max(1024, params.maxTokens ?? 1024)));
      if (params.validate && !params.validate(result.content)) throw Error("Invalid feature-specific output");
      return result;
    }
    catch (error) {
      console.warn("[ai-router] provider failed:", provider.provider,
        error instanceof Error ? error.message : "unknown error");
    }
  }
  throw new Error("Nenhum provedor de IA configurado respondeu com um plano JSON válido.");
}
