"use client";

import { useEffect, useState } from "react";
import { getLanToken } from "@/lan-sync/client";

type ProviderId = "nvidia" | "moonshot" | "openai" | "anthropic" | "deepseek";
type PublicAccount = { provider: ProviderId; model: string; priority: number; enabled: boolean; configured: boolean };
export type PublicConfiguration = { allowPaid: boolean; accounts: PublicAccount[]; preferred: string; ollamaModel: string };
const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "nvidia", label: "NVIDIA NIM" },
  { id: "moonshot", label: "Kimi / Moonshot" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude / Anthropic" },
  { id: "deepseek", label: "DeepSeek" },
];

function secureClient(): boolean {
  return typeof window !== "undefined" &&
    (window.location.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname));
}

export async function configuredRequest(method: "GET" | "PUT" | "DELETE", data?: unknown): Promise<PublicConfiguration> {
  // Keep read-only status usable on LAN. Credential writes require TLS or an explicit trusted-LAN opt-in.
  if (method === "PUT" && data && typeof data === "object" && "key" in data && data.key && !confirmCredentialTransport()) throw new Error("Envio da chave cancelado.");
  const token = getLanToken();
  if (!token) throw new Error("Conecte a LAN com o token administrativo do host.");
  const response = await fetch("/api/ai/providers", {
    method,
    cache: "no-store",
    headers: { "x-lan-sync-token": token, ...(data ? { "Content-Type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "Não foi possível salvar a configuração.";
    throw new Error(reason);
  }
  return body as PublicConfiguration;
}

async function testConfiguredProvider(provider: ProviderId): Promise<{ provider: string; model: string }> {
  const token = getLanToken();
  if (!token) throw new Error("Conecte a LAN com o token administrativo do host.");
  const response = await fetch("/api/ai/providers", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-lan-sync-token": token },
    body: JSON.stringify({ provider }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object" ||
    typeof (body as Record<string, unknown>).model !== "string") {
    const reason = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "O provedor não respondeu ao teste.";
    throw new Error(reason);
  }
  return body as { provider: string; model: string };
}

export function confirmCredentialTransport(): boolean {
  if (secureClient()) return true;
  const host = window.location.hostname;
  const privateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (!privateLan) throw Error("Use HTTPS ou localhost para transmitir credenciais.");
  return window.confirm("Conexão HTTP na rede local: a chave poderá ser interceptada por outros dispositivos. Use somente uma rede privada confiável. Deseja continuar? (HTTPS é recomendado)");
}

export function AIProvidersPanel() {
  const [config, setConfig] = useState<PublicConfiguration | null>(null);
  const [provider, setProvider] = useState<ProviderId>("nvidia");
  const [model, setModel] = useState("");
  const [secret, setSecret] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [priority, setPriority] = useState(10);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      const data = await configuredRequest("GET");
      setConfig(data);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Cofre não disponível"); }
  };
  useEffect(() => { void refresh(); }, []);
  const discover = async () => {
    setLoadingModels(true); setError(""); setMessage("");
    try {
      if (secret && !confirmCredentialTransport()) return;
      const token = getLanToken();
      if (!token) throw Error("Conecte a LAN com o token administrativo do host.");
      const response = await fetch("/api/ai/providers", { method: "POST", headers: { "Content-Type": "application/json", "x-lan-sync-token": token }, body: JSON.stringify({ mode: "models", provider, key: secret }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Não foi possível carregar o catálogo.");
      const available: string[] = Array.isArray(result.models) ? result.models.filter((m: unknown) => typeof m === "string") : [];
      setModels(available);
      if (!model.trim() && available.length === 1) setModel(available[0]);
      setMessage(available.length ? `${available.length} modelos encontrados. Escolha um na lista; nem todos aceitam geração de texto.` : "Catálogo vazio. Digite o ID exato manualmente.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar modelos"); }
    finally { setLoadingModels(false); }
  };

  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!model.trim()) throw Error("Escolha um modelo em Buscar modelos ou informe seu ID.");
      setConfig(await configuredRequest("PUT", { provider, model: model.trim(),
        key: secret, enabled, priority }));
      setSecret("");
      setMessage("Configuração criptografada salva no host. Nenhuma chave é devolvida à interface.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar"); }
    finally { setBusy(false); }
  };
  const remove = async (id: ProviderId) => {
    if (!window.confirm("Apagar a chave deste provedor do servidor?")) return;
    setBusy(true); setError("");
    try { setConfig(await configuredRequest("DELETE", { provider: id })); }
    catch(e) { setError(e instanceof Error ? e.message : "Falha ao remover"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await testConfiguredProvider(provider);
      setMessage(`Conexão confirmada: ${result.provider} · ${result.model}. A chave permanece somente no host.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao testar o provedor"); }
    finally { setBusy(false); }
  };
  const allow = async (value: boolean) => {
    if (value && !window.confirm("Permitir chamadas a APIs de IA externas que podem consumir créditos pagos? Você é responsável pelos custos cobrados pelos provedores.")) return;
    setBusy(true); setError("");
    try { setConfig(await configuredRequest("PUT", { mode: "allow-paid", allowPaid: value })); }
    catch(e) { setError(e instanceof Error ? e.message : "Falha ao atualizar autorização"); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-lg border p-3 text-xs">
      <h3 className="font-semibold">F03 · Credenciais e roteamento de IA</h3>
      <p className="text-muted-foreground">As chaves são criptografadas em arquivo no host. A interface exibe apenas quais provedores estão configurados; Ollama local não requer chave.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={config?.allowPaid ?? false}
          disabled={busy || !config} onChange={(e) => void allow(e.target.checked)}/>
        <span>Autorizar chamadas a APIs externas potencialmente pagas (desativado por padrão)</span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>Provedor
          <select className="bg-background mt-1 w-full rounded border px-2 py-1"
            value={provider} onChange={(e) => {
              const id = e.target.value as ProviderId;
              setProvider(id);
              const existing = config?.accounts.find(a=>a.provider===id);
              setModel(existing?.model || "");
              setPriority(existing?.priority || 10);
              setEnabled(existing?.enabled ?? true);
              setSecret("");
              setModels([]);
            }}>
            {PROVIDERS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Identificador do modelo
          <input className="bg-background mt-1 w-full rounded border px-2 py-1" value={model}
            placeholder="Escolha ou digite o modelo" list="ai-provider-models" onChange={(e)=>setModel(e.target.value)} />
          <datalist id="ai-provider-models">{models.map(id => <option key={id} value={id} />)}</datalist>
          {models.length > 0 && <select aria-label="Modelos disponíveis" className="bg-background mt-1 w-full rounded border p-1" value={models.includes(model) ? model : ""} onChange={e=>setModel(e.target.value)}><option value="">Selecionar modelo da lista</option>{models.map(id=><option key={id} value={id}>{id}</option>)}</select>}
          <button type="button" className="mt-1 rounded border px-2 py-1" disabled={loadingModels || busy} onClick={()=>void discover()}>{loadingModels ? "Buscando..." : "Buscar modelos pela API"}</button>
        </label>
        <label>API Key (campo opcional para atualizar chave já salva)
          <input className="bg-background mt-1 w-full rounded border px-2 py-1" type="password"
            autoComplete="off" value={secret} onChange={(e)=>setSecret(e.target.value)} />
        </label>
        <label>Prioridade (menor vem primeiro)
          <input className="bg-background mt-1 w-full rounded border px-2 py-1" type="number"
            min={0} max={100} value={priority} onChange={(e)=>setPriority(Number(e.target.value))}/>
        </label>
      </div>
      <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Provedor habilitado</label>
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40"
        disabled={busy || loadingModels} onClick={()=>void save()}>{busy?"Salvando...":"Salvar configurações"}</button>
      <button type="button" className="ml-2 rounded border px-2 py-1 disabled:opacity-40"
        disabled={busy || !config?.allowPaid || !config.accounts.some(account => account.provider === provider && account.configured)}
        onClick={()=>void test()}>Testar chamada</button>
      <button type="button" className="ml-2 underline" onClick={()=>void refresh()}>Atualizar status</button>
      <p className="text-muted-foreground">Use HTTPS ou localhost para proteger as credenciais. Em HTTP privado, é exigida confirmação explícita. O fallback usa apenas provedores habilitados; chamadas externas podem consumir créditos.</p>
      <div className="space-y-2 border-t pt-2">
        <h4 className="font-semibold">Modelos configurados no host</h4>
        {!config?.accounts.length && <p className="text-muted-foreground">Nenhum modelo cadastrado. Informe a chave, busque os modelos e salve.</p>}
        {config?.accounts.map(account=><div key={account.provider} className="rounded border p-2 space-y-1">
          <p className="break-all">{account.provider} · {account.model}</p>
          <p className="text-muted-foreground">{account.configured?"Chave salva":"Sem chave"} · {account.enabled?"Habilitado":"Desabilitado"} · prioridade {account.priority}{config.preferred===account.provider?" · Principal":""}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="underline" onClick={()=>{setProvider(account.provider);setModel(account.model);setPriority(account.priority);setEnabled(account.enabled);setSecret("");setModels([]);}}>Editar</button>
            <button type="button" className="underline" disabled={busy || !config.allowPaid || !account.enabled} onClick={async()=>{try {setConfig(await configuredRequest("PUT",{mode:"selection",preferred:account.provider}));setMessage("Provedor principal atualizado.");}catch(e){setError(e instanceof Error?e.message:"Falha");}}}>Usar como principal</button>
            <button type="button" className="underline" disabled={busy} onClick={()=>void remove(account.provider)}>Remover</button>
          </div>
        </div>)}
      </div>
      {error && <p className="text-amber-500" role="alert">{error}</p>}
      {message && <p className="text-muted-foreground">{message}</p>}

    </section>
  );
}
