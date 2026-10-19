"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Download, Network, RefreshCw, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { cn } from "@/utils/ui";
import {
	isN8nWebhookPathValid,
	useIntegrationStore,
} from "@/automation/integration-store";

type IntegrationStatus = {
	n8n: { connected: boolean };
	ollama: { connected: boolean; models: string[] };
	mcp: { connected: boolean; endpoint: string; port: number };
};

type InboxMedia = {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	createdAt: string;
	importedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStatus(value: unknown): IntegrationStatus | null {
	if (!isRecord(value)) return null;
	const n8n = value.n8n;
	const ollama = value.ollama;
	const mcp = value.mcp;
	if (!isRecord(n8n) || !isRecord(ollama) || !isRecord(mcp)) return null;
	if (
		typeof n8n.connected !== "boolean" ||
		typeof ollama.connected !== "boolean" ||
		!Array.isArray(ollama.models) ||
		!ollama.models.every((model) => typeof model === "string") ||
		typeof mcp.connected !== "boolean" ||
		typeof mcp.endpoint !== "string" ||
		typeof mcp.port !== "number"
	) {
		return null;
	}
	return {
		n8n: { connected: n8n.connected },
		ollama: { connected: ollama.connected, models: ollama.models },
		mcp: {
			connected: mcp.connected,
			endpoint: mcp.endpoint,
			port: mcp.port,
		},
	};
}

function parseInbox(value: unknown): InboxMedia[] {
	if (!isRecord(value) || !Array.isArray(value.media)) return [];
	return value.media.flatMap((item) => {
		if (
			!isRecord(item) ||
			typeof item.id !== "string" ||
			typeof item.name !== "string" ||
			typeof item.mimeType !== "string" ||
			typeof item.size !== "number" ||
			typeof item.createdAt !== "string"
		) {
			return [];
		}
		return [
			{
				id: item.id,
				name: item.name,
				mimeType: item.mimeType,
				size: item.size,
				createdAt: item.createdAt,
				...(typeof item.importedAt === "string"
					? { importedAt: item.importedAt }
					: {}),
			},
		];
	});
}

function StatusRow({
	icon: Icon,
	label,
	connected,
	detail,
}: {
	icon: typeof Bot;
	label: string;
	connected: boolean;
	detail: string;
}) {
	return (
		<div className="flex items-center gap-2 rounded-md border bg-background p-2">
			<Icon className="text-muted-foreground size-4 shrink-0" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span
						className={cn(
							"size-1.5 rounded-full",
							connected ? "bg-constructive" : "bg-muted-foreground/50",
						)}
					/>
					<p className="text-xs font-medium">{label}</p>
				</div>
				<p className="text-muted-foreground mt-0.5 truncate text-[11px]">
					{detail}
				</p>
			</div>
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AutomationConnections() {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActive());
	const [status, setStatus] = useState<IntegrationStatus | null>(null);
	const [inbox, setInbox] = useState<InboxMedia[]>([]);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [importingId, setImportingId] = useState<string | null>(null);
	const { n8nWebhookPath, setN8nWebhookPath } = useIntegrationStore();

	const refresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const [statusResponse, inboxResponse] = await Promise.all([
				fetch("/api/integrations/status", { cache: "no-store" }),
				fetch("/api/integrations/n8n/media", { cache: "no-store" }),
			]);
			const nextStatus = parseStatus(await statusResponse.json());
			const nextInbox = parseInbox(await inboxResponse.json());
			setStatus(nextStatus);
			setInbox(nextInbox);
		} catch {
			setStatus(null);
		} finally {
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		const initialTimer = window.setTimeout(() => void refresh(), 0);
		const timer = window.setInterval(() => void refresh(), 15_000);
		return () => {
			window.clearTimeout(initialTimer);
			window.clearInterval(timer);
		};
	}, [refresh]);

	const handleImport = async (item: InboxMedia) => {
		setImportingId(item.id);
		try {
			const response = await fetch(`/api/integrations/n8n/media/${item.id}`);
			if (!response.ok)
				throw new Error("Não foi possível baixar o arquivo do n8n");
			const blob = await response.blob();
			const file = new File([blob], item.name, {
				type: item.mimeType || blob.type,
			});
			const assets = await processMediaAssets({ files: [file] });
			for (const asset of assets) {
				await editor.media.addMediaAsset({
					projectId: project.metadata.id,
					asset,
				});
			}
			if (assets.length === 0)
				throw new Error("Formato de mídia não suportado");
			await fetch(`/api/integrations/n8n/media/${item.id}`, {
				method: "PATCH",
			});
			toast.success(`${item.name} importado do n8n`);
			await refresh();
		} catch (error) {
			toast.error("Falha ao importar do n8n", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setImportingId(null);
		}
	};

	const pendingMedia = inbox.filter((item) => !item.importedAt);
	const webhookIsValid =
		n8nWebhookPath.length === 0 || isN8nWebhookPathValid(n8nWebhookPath);

	return (
		<section className="space-y-3 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Network className="text-muted-foreground size-4" />
					<h3 className="text-sm font-medium">Conexões locais</h3>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Atualizar conexões"
					onClick={() => void refresh()}
					disabled={isRefreshing}
				>
					<RefreshCw
						className={cn("size-3.5", isRefreshing && "animate-spin")}
					/>
				</Button>
			</div>

			<div className="space-y-1.5">
				<StatusRow
					icon={Bot}
					label="Ollama"
					connected={status?.ollama.connected ?? false}
					detail={
						status?.ollama.connected
							? `${status.ollama.models.length} modelo(s): ${status.ollama.models.slice(0, 2).join(", ")}`
							: "Não detectado"
					}
				/>
				<StatusRow
					icon={Workflow}
					label="n8n"
					connected={status?.n8n.connected ?? false}
					detail={
						status?.n8n.connected ? "Servidor local conectado" : "Não detectado"
					}
				/>
				<StatusRow
					icon={Network}
					label="MCP"
					connected={status?.mcp.connected ?? false}
					detail={
						status?.mcp.connected
							? `Streamable HTTP ativo na porta ${status.mcp.port}`
							: "Iniciando ou indisponível"
					}
				/>
			</div>

			<div className="space-y-1.5 border-t pt-3">
				<label htmlFor="n8n-webhook-path" className="text-xs font-medium">
					Webhook para receber exports no n8n
				</label>
				<Input
					id="n8n-webhook-path"
					value={n8nWebhookPath}
					onChange={(event) => setN8nWebhookPath(event.target.value.trim())}
					placeholder="/webhook/opencut-video"
					aria-invalid={!webhookIsValid}
				/>
				<p
					className={cn(
						"text-[11px]",
						webhookIsValid ? "text-muted-foreground" : "text-destructive",
					)}
				>
					{webhookIsValid
						? "O export envia o vídeo como campo binário “video”."
						: "Use um caminho /webhook/... ou /webhook-test/..."}
				</p>
			</div>

			{pendingMedia.length > 0 && (
				<div className="space-y-2 border-t pt-3">
					<div className="flex items-center justify-between">
						<p className="text-xs font-medium">Arquivos recebidos do n8n</p>
						<span className="text-muted-foreground text-[11px]">
							{pendingMedia.length}
						</span>
					</div>
					{pendingMedia.slice(0, 4).map((item) => (
						<div
							key={item.id}
							className="flex items-center gap-2 rounded-md bg-muted/50 p-2"
						>
							<Download className="text-muted-foreground size-3.5 shrink-0" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-xs">{item.name}</p>
								<p className="text-muted-foreground text-[10px]">
									{formatBytes(item.size)}
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void handleImport(item)}
								disabled={importingId !== null}
							>
								{importingId === item.id ? "Importando…" : "Importar"}
							</Button>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
