"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, LoaderCircle, OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type RenderStatusValue =
	| "queued"
	| "rendering"
	| "complete"
	| "failed"
	| "cancelled";

interface RenderJobResponse {
	status: RenderStatusValue;
	progress?: number;
	error?: string;
	downloadUrl?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRenderStatusValue(value: unknown): value is RenderStatusValue {
	return (
		value === "queued" ||
		value === "rendering" ||
		value === "complete" ||
		value === "failed" ||
		value === "cancelled"
	);
}

function isRenderJobResponse(value: unknown): value is RenderJobResponse {
	if (!isRecord(value) || !isRenderStatusValue(value.status)) return false;
	return (
		(value.progress === undefined || typeof value.progress === "number") &&
		(value.error === undefined || typeof value.error === "string") &&
		(value.downloadUrl === undefined ||
			value.downloadUrl === null ||
			typeof value.downloadUrl === "string")
	);
}

export function RenderStatus({ jobId }: { jobId: string }) {
	const [job, setJob] = useState<RenderJobResponse>({
		status: "queued",
		progress: 0,
	});
	const [networkError, setNetworkError] = useState<string | null>(null);
	const downloadStarted = useRef(false);

	useEffect(() => {
		const controller = new AbortController();
		const poll = async () => {
			while (!controller.signal.aborted) {
				try {
					const response = await fetch(`/api/server-render/jobs/${jobId}`, {
						signal: controller.signal,
						cache: "no-store",
					});
					const payload: unknown = await response.json();
					if (!response.ok)
						throw new Error(
							isRecord(payload) && typeof payload.error === "string"
								? payload.error
								: "Render não encontrado",
						);
					if (!isRenderJobResponse(payload)) {
						throw new Error("O servidor devolveu um status inválido");
					}
					setNetworkError(null);
					setJob(payload);
					if (
						payload.status === "complete" &&
						payload.downloadUrl &&
						!downloadStarted.current
					) {
						downloadStarted.current = true;
						const anchor = document.createElement("a");
						anchor.href = payload.downloadUrl;
						anchor.download = "";
						document.body.append(anchor);
						anchor.click();
						anchor.remove();
						return;
					}
					if (["failed", "cancelled"].includes(payload.status)) return;
				} catch (error) {
					if (controller.signal.aborted) return;
					setNetworkError(
						error instanceof Error ? error.message : "Servidor indisponível",
					);
				}
				await new Promise((resolve) => window.setTimeout(resolve, 1000));
			}
		};
		void poll();
		return () => controller.abort();
	}, [jobId]);

	const cancel = async () => {
		await fetch(`/api/server-render/jobs/${jobId}`, { method: "DELETE" });
		setJob({ status: "cancelled", progress: job.progress });
	};
	const progress = Math.round((job.progress ?? 0) * 100);
	const terminalError = job.status === "failed" || job.status === "cancelled";

	return (
		<main className="grid min-h-screen place-items-center bg-[#0b0b0d] px-6 text-white">
			<div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
				<div className="mb-5 flex items-center gap-3">
					<div className="flex size-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
						{terminalError ? (
							<OctagonX className="size-6 text-red-400" />
						) : job.status === "complete" ? (
							<CheckCircle2 className="size-6 text-emerald-400" />
						) : (
							<LoaderCircle className="size-6 animate-spin" />
						)}
					</div>
					<div>
						<h1 className="text-xl font-semibold">
							{job.status === "complete"
								? "Vídeo pronto"
								: terminalError
									? job.status === "cancelled"
										? "Renderização cancelada"
										: "Falha na renderização"
									: "Renderizando neste servidor"}
						</h1>
						<p className="text-xs text-white/50">Job {jobId.slice(0, 8)}</p>
					</div>
				</div>

				{!terminalError && job.status !== "complete" && (
					<>
						<div className="mb-2 flex justify-between text-sm">
							<span className="text-white/60">Processando vídeo e áudio</span>
							<span className="font-medium tabular-nums">{progress}%</span>
						</div>
						<Progress value={progress} className="mb-5" />
						<p className="mb-5 text-xs leading-relaxed text-white/50">
							Você pode continuar editando na outra aba. O download começa
							automaticamente quando terminar.
						</p>
						<Button
							variant="outline"
							className="w-full border-white/15 bg-transparent text-white hover:bg-white/10"
							onClick={cancel}
						>
							Cancelar renderização
						</Button>
					</>
				)}

				{job.status === "complete" && job.downloadUrl && (
					<div className="space-y-3">
						<p className="text-sm text-white/60">
							O download foi iniciado automaticamente. Se não aparecer, use o
							botão abaixo.
						</p>
						<Button asChild className="w-full">
							<a href={job.downloadUrl} download>
								<Download className="size-4" /> Baixar vídeo
							</a>
						</Button>
					</div>
				)}

				{terminalError && (
					<p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
						{job.error || "A renderização não foi concluída."}
					</p>
				)}
				{networkError && !terminalError && (
					<p className="mt-4 text-xs text-amber-300">
						Conexão temporariamente indisponível: {networkError}. Tentando
						novamente…
					</p>
				)}
			</div>
		</main>
	);
}
