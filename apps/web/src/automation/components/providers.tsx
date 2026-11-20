"use client";

import { useEffect, useState } from "react";
import { getLanToken } from "@/lan-sync/client";

type ProviderId = "nvidia" | "moonshot" | "openai" | "anthropic" | "deepseek";
type PublicAccount = { provider: ProviderId; model: string; priority: number; enabled: boolean; configured: boolean };
type PublicConfiguration = { allowPaid: boolean; accounts: PublicAccount[] };
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

async function configuredRequest(method: "GET" | "PUT" | "DELETE", data?: unknown): Promise<PublicConfiguration> {
  if (!secureClient()) throw new Error("Para cadastrar chaves, acesse o Editor por HTTPS ou localhost no próprio host.");
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

export function AIProvidersPanel() {
  const [config, setConfig] = useState<PublicConfiguration | null>(null);
  const [provider, setProvider] = useState<ProviderId>("nvidia");
  const [model, setModel] = useState("");
  const [secret, setSecret] = useState("");
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
  useEffect(() => { if (getLanToken()) void refresh(); }, []);

  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
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
            }}>
            {PROVIDERS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Identificador do modelo
          <input className="bg-background mt-1 w-full rounded border px-2 py-1" value={model}
            placeholder="Digite o ID exato do modelo" onChange={(e)=>setModel(e.target.value)} />
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
        disabled={busy || !model.trim()} onClick={()=>void save()}>{busy?"Salvando...":"Salvar configurações"}</button>
      <button type="button" className="ml-2 underline" onClick={()=>void refresh()}>Atualizar status</button>
      {config && <div className="space-y-1 border-t pt-2">
        {config.accounts.map(account=><div key={account.provider} className="flex items-center justify-between gap-2">
          <span>{account.provider} · {account.model} · {account.configured?"Chave salva":"Sem chave"} · prioridade {account.priority}</span>
          <button className="underline" type="button" disabled={busy} onClick={()=>void remove(account.provider)}>Remover</button>
        </div>)}
      </div>}
      {error && <p className="text-amber-500" role="alert">{error}</p>}
      {message && <p className="text-muted-foreground">{message}</p>}
      <p className="text-muted-foreground">HTTPS obrigatório para cadastrar senhas pela rede. O fallback é aplicado apenas a modelos configurados e habilitados. Nenhuma resposta de IA é executada sem revisão.</p>
    </section>
  );
}
