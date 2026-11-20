/** Provider credentials remain on the server. Never accept arbitrary API URLs from users. */
export type PlanProvider = "nvidia" | "openai" | "ollama";
export type PlanMessage = { role: "system" | "user"; content: string };
export type PlanCompletion = { provider: PlanProvider; model: string; content: string };

type ProviderConfig = { provider: PlanProvider; url: string; model: string; token?: string };
function configFor(provider: PlanProvider): ProviderConfig | null {
  if (provider === "nvidia") {
    if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_MODEL) return null;
    return {
      provider, url: "https://integrate.api.nvidia.com/v1/chat/completions",
      token: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL,
    };
  }
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return null;
    return {
      provider, url: "https://api.openai.com/v1/chat/completions",
      token: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
    };
  }
  const base = (process.env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434").replace(/\/$/, "");
  return { provider, url: base + "/api/chat", model: process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b" };
}

export function supportedProviders(): PlanProvider[] {
  return (["nvidia", "openai", "ollama"] as const).filter((p) => configFor(p) !== null);
}
export function providerOrder(preferred: unknown): PlanProvider[] {
  const available = supportedProviders();
  if (typeof preferred === "string" && available.includes(preferred as PlanProvider)) {
    return [preferred as PlanProvider, ...available.filter((p) => p !== preferred)];
  }
  return available;
}

function getContent(data: unknown, provider: PlanProvider): string | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const message = provider === "ollama"
    ? value.message
    : Array.isArray(value.choices) && value.choices.length ? value.choices[0]?.message : null;
  if (!message || typeof message !== "object") return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

async function callProvider(
  provider: PlanProvider, messages: PlanMessage[], format: unknown,
): Promise<PlanCompletion> {
  const config = configFor(provider);
  if (!config) throw new Error("Provider is not configured");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.token) headers.Authorization = "Bearer " + config.token;
  const body = provider === "ollama"
    ? { model: config.model, messages, stream: false, format, options: { temperature: 0 } }
    : { model: config.model, messages, stream: false, temperature: 0 };
  const response = await fetch(config.url, {
    method: "POST", headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(provider + " HTTP " + response.status);
  const raw: unknown = await response.json();
  const content = getContent(raw, provider);
  if (!content) throw new Error(provider + " returned no text");
  // A provider may return prose instead of structured JSON; retry the next provider.
  let parsed: unknown;
  try { parsed = JSON.parse(content) as unknown; }
  catch { throw new Error(provider + " returned malformed JSON"); }
  if (!parsed || typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).summary !== "string" ||
      !Array.isArray((parsed as Record<string, unknown>).commands)) {
    throw new Error(provider + " returned invalid editing plan schema");
  }
  return { provider, model: config.model, content };
}

export async function createRoutedPlan(
  params: { messages: PlanMessage[]; format: unknown; preferred?: unknown },
): Promise<PlanCompletion> {
  const order = providerOrder(params.preferred);
  for (const provider of order) {
    try { return await callProvider(provider, params.messages, params.format); }
    catch (error) {
      console.warn("[ai-router] provider failed:", provider,
        error instanceof Error ? error.message : "unknown error");
    }
  }
  throw new Error("Nenhum provedor de IA configurado respondeu com um plano JSON válido.");
}
