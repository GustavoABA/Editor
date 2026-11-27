import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type ManagedProviderId = "nvidia" | "moonshot" | "openai" | "anthropic" | "deepseek";
export type ProviderAccount = {
  provider: ManagedProviderId;
  model: string;
  key: string;
  enabled: boolean;
  priority: number;
};
export type AIProviderConfiguration = {
  allowPaid: boolean;
  preferred?: ManagedProviderId | "ollama" | "local" | "auto";
  ollamaModel?: string;
  accounts: ProviderAccount[];
};

export const PROVIDER_IDS: readonly ManagedProviderId[] = [
  "nvidia", "moonshot", "openai", "anthropic", "deepseek",
];
const CONFIG_PATH = path.join(process.env.AUTOMATION_DIR || "/app/automation", "ai-providers.enc.json");
const DEFAULT_CONFIG: AIProviderConfiguration = { allowPaid: false, accounts: [] };

function key(): Buffer {
  const raw = process.env.BETTER_AUTH_SECRET || "";
  if (raw.length < 16) throw new Error("Configure BETTER_AUTH_SECRET (16+ chars) para habilitar credenciais de IA");
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptConfiguration(data: AIProviderConfiguration): Record<string, string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return { v: "1", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64") };
}

export function decryptConfiguration(raw: Record<string, unknown>): AIProviderConfiguration {
  if (raw.v !== "1" || typeof raw.iv !== "string" ||
      typeof raw.tag !== "string" || typeof raw.ciphertext !== "string") throw new Error("Invalid AI provider vault");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(raw.iv, "base64"));
  decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(raw.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const data: unknown = JSON.parse(decoded);
  if (!data || typeof data !== "object" || !Array.isArray((data as AIProviderConfiguration).accounts)) {
    throw new Error("Invalid AI provider configuration");
  }
  return data as AIProviderConfiguration;
}

export async function readProviderConfiguration(): Promise<AIProviderConfiguration> {
  try {
    const contents: unknown = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    return decryptConfiguration(contents as Record<string, unknown>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG, accounts: [] };
    throw error;
  }
}

export async function writeProviderConfiguration(data: AIProviderConfiguration): Promise<void> {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  const tmp = CONFIG_PATH + "." + randomUUID() + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(encryptConfiguration(data)), { mode: 0o600 });
    await rename(tmp, CONFIG_PATH);
  } finally { await rm(tmp, { force: true }).catch(() => undefined); }
}

export function publicProviderConfiguration(data: AIProviderConfiguration) {
  return {
    allowPaid: data.allowPaid,
    preferred: data.preferred || "auto",
    ollamaModel: data.ollamaModel || process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
    accounts: data.accounts.map(({ provider, model, enabled, priority, key }) => ({
      provider, model, enabled, priority, configured: key.length > 0,
    })),
  };
}
