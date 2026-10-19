"use client";

import { useRef, useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { createServerRenderJob } from "@/server-render/client";
import {
	isN8nWebhookPathValid,
	useIntegrationStore,
} from "@/automation/integration-store";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

type ServerRenderStatus =
	| "idle"
	| "uploading"
	| "rendering"
	| "complete"
	| "cancelled"
	| "error";

interface ServerRenderState {
	status: ServerRenderStatus;
	message: string;
	error: string | null;
	progress: number;
	downloadUrl: string | null;
}

type RenderJobStatus =
	| "queued"
	| "rendering"
	| "complete"
	| "failed"
	| "cancelled";

interface RenderJobResponse {
	status: RenderJobStatus;
	error?: string;
	progress?: number;
	downloadUrl?: string | null;
	deliveries?: {
		n8n?: { status: "complete" | "failed"; error?: string };
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRenderJobStatus(value: unknown): value is RenderJobStatus {
	return (
		value === "queued" ||
		value === "rendering" ||
		value === "complete" ||
		value === "failed" ||
		value === "cancelled"
	);
}

function isRenderJobResponse(value: unknown): value is RenderJobResponse {
	if (!isRecord(value) || !isRenderJobStatus(value.status)) return false;
	return (
		(value.error === undefined || typeof value.error === "string") &&
		(value.progress === undefined || typeof value.progress === "number") &&
		(value.downloadUrl === undefined ||
			value.downloadUrl === null ||
			typeof value.downloadUrl === "string")
	);
}

const initialServerRenderState: ServerRenderState = {
	status: "idle",
	message: "",
	error: null,
	progress: 0,
	downloadUrl: null,
};

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const hasProject = !!activeProject;

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					onClick={hasProject ? () => setIsExportPopoverOpen(true) : undefined}
					disabled={!hasProject}
					onKeyDown={(event) => {
						if (hasProject && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							setIsExportPopoverOpen(true);
						}
					}}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-3.5" />
						<span className="z-50 text-[0.875rem]">Export</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7]"></div>
						</div>
					</div>
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover />}
		</Popover>
	);
}

function ExportPopover() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const { isExporting, progress, result: exportResult } = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const [serverRenderState, setServerRenderState] = useState<ServerRenderState>(
		initialServerRenderState,
	);
	const {
		n8nWebhookPath,
		sendExportsToN8n,
		setSendExportsToN8n,
	} = useIntegrationStore();
	const requestControllerRef = useRef<AbortController | null>(null);
	const renderJobIdRef = useRef<string | null>(null);

	const handleExport = async () => {
		if (!activeProject) return;
		if (["uploading", "rendering"].includes(serverRenderState.status)) return;
		requestControllerRef.current?.abort();
		const controller = new AbortController();
		requestControllerRef.current = controller;
		renderJobIdRef.current = null;
		const downloadWindow = window.open("/render/preparing", "_blank");
		setServerRenderState({
			status: "uploading",
			message: "Enviando arquivos ao servidor…",
			error: null,
			progress: 0,
			downloadUrl: null,
		});

		try {
			const created = await createServerRenderJob({
				editor,
				format,
				quality,
				includeAudio: shouldIncludeAudio,
				n8nWebhookPath:
					sendExportsToN8n && isN8nWebhookPathValid(n8nWebhookPath)
						? n8nWebhookPath
						: undefined,
				signal: controller.signal,
			});
			renderJobIdRef.current = created.jobId;
			const statusUrl = `/render/${created.jobId}`;
			if (downloadWindow && !downloadWindow.closed) {
				downloadWindow.location.href = statusUrl;
			} else {
				window.open(statusUrl, "_blank");
			}
			setServerRenderState((state) => ({
				...state,
				status: "rendering",
				message: "Renderizando neste servidor…",
			}));
			const deadline = Date.now() + 12 * 60 * 1000;
			while (true) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				if (controller.signal.aborted)
					throw new DOMException("Cancelled", "AbortError");
				if (Date.now() > deadline) {
					throw new Error(
						"O servidor excedeu o limite de 12 minutos para este render.",
					);
				}
				const response = await fetch(
					`/api/server-render/jobs/${created.jobId}`,
					{
						signal: controller.signal,
						cache: "no-store",
					},
				);
				const payload: unknown = await response.json();
				if (!isRenderJobResponse(payload)) {
					throw new Error("O servidor devolveu um status de render inválido");
				}
				const job = payload;
				if (!response.ok)
					throw new Error(job.error || "Não foi possível consultar o render");
				setServerRenderState((state) => ({
					...state,
					progress: job.progress ?? state.progress,
				}));
				if (job.status === "complete" && job.downloadUrl) {
					setServerRenderState({
						status: "complete",
						message: "Vídeo pronto — o download foi aberto na outra aba.",
						error: null,
						progress: 1,
						downloadUrl: job.downloadUrl,
					});
					return;
				}
				if (job.status === "failed")
					throw new Error(job.error || "Server render failed");
				if (job.status === "cancelled") {
					setServerRenderState({
						status: "cancelled",
						message: "Renderização cancelada.",
						error: null,
						progress: job.progress ?? 0,
						downloadUrl: null,
					});
					return;
				}
			}
		} catch (error) {
			if (controller.signal.aborted) {
				setServerRenderState((state) => ({
					...state,
					status: "cancelled",
					message: "Renderização cancelada.",
					error: null,
				}));
				return;
			}
			if (!renderJobIdRef.current) downloadWindow?.close();
			setServerRenderState({
				status: "error",
				message: "",
				error: error instanceof Error ? error.message : "Server render failed",
				progress: 0,
				downloadUrl: null,
			});
		} finally {
			if (requestControllerRef.current === controller) {
				requestControllerRef.current = null;
			}
		}
	};

	const handleCancel = () => {
		requestControllerRef.current?.abort();
		const jobId = renderJobIdRef.current;
		if (jobId) {
			void fetch(`/api/server-render/jobs/${jobId}`, { method: "DELETE" });
		}
		setServerRenderState((state) => ({
			...state,
			status: "cancelled",
			message: "Renderização cancelada.",
			error: null,
		}));
	};
	const isServerRendering = ["uploading", "rendering"].includes(
		serverRenderState.status,
	);

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			{serverRenderState.status === "error" ||
			(exportResult && !exportResult.success) ? (
				<ExportError
					error={
						serverRenderState.error ||
						exportResult?.error ||
						"Unknown error occurred"
					}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between p-3 border-b">
						<h3 className="font-medium text-sm">
							{isExporting || isServerRendering
								? "Exporting project"
								: "Export project"}
						</h3>
					</div>

					<div className="flex flex-col gap-4">
						{!isExporting &&
							!isServerRendering &&
							serverRenderState.status !== "complete" && (
								<>
									<div className="flex flex-col">
										<Section
											collapsible
											defaultOpen={false}
											showTopBorder={false}
										>
											<SectionHeader>
												<SectionTitle>Format</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<RadioGroup
													value={format}
													onValueChange={(value) => {
														if (isExportFormat(value)) {
															setFormat(value);
														}
													}}
												>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="mp4" id="mp4" />
														<Label htmlFor="mp4">
															MP4 (H.264) - Better compatibility
														</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="webm" id="webm" />
														<Label htmlFor="webm">
															WebM (VP9) - Smaller file size
														</Label>
													</div>
												</RadioGroup>
											</SectionContent>
										</Section>

										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Quality</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<RadioGroup
													value={quality}
													onValueChange={(value) => {
														if (isExportQuality(value)) {
															setQuality(value);
														}
													}}
												>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="low" id="low" />
														<Label htmlFor="low">
															Low - Smallest file size
														</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="medium" id="medium" />
														<Label htmlFor="medium">Medium - Balanced</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="high" id="high" />
														<Label htmlFor="high">High - Recommended</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="very_high" id="very_high" />
														<Label htmlFor="very_high">
															Very high - Largest file size
														</Label>
													</div>
												</RadioGroup>
											</SectionContent>
										</Section>

										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Audio</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<div className="flex items-center space-x-2">
													<Checkbox
														id="include-audio"
														checked={shouldIncludeAudio}
														onCheckedChange={(checked) =>
															setShouldIncludeAudio(!!checked)
														}
													/>
													<Label htmlFor="include-audio">
														Include audio in export
													</Label>
												</div>
											</SectionContent>
										</Section>

										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>n8n</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<div className="flex items-start space-x-2">
													<Checkbox
														id="send-to-n8n"
														checked={sendExportsToN8n}
														onCheckedChange={(checked) =>
															setSendExportsToN8n(!!checked)
														}
														disabled={!isN8nWebhookPathValid(n8nWebhookPath)}
													/>
													<Label htmlFor="send-to-n8n" className="leading-snug">
														Enviar o vídeo pronto ao webhook configurado
													</Label>
												</div>
												{!isN8nWebhookPathValid(n8nWebhookPath) && (
													<p className="text-muted-foreground mt-2 text-xs">
														Configure o webhook em IA & Automação.
													</p>
												)}
											</SectionContent>
										</Section>
									</div>

									<div className="p-3 pt-0">
										<Button onClick={handleExport} className="w-full gap-2">
											<Download className="size-4" />
											Export
										</Button>
									</div>
								</>
							)}

						{(isExporting || isServerRendering) && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{isServerRendering
												? serverRenderState.message
												: `${Math.round(progress * 100)}%`}
										</p>
										<p className="text-muted-foreground text-sm tabular-nums">
											{Math.round(
												(isServerRendering
													? serverRenderState.progress
													: progress) * 100,
											)}
											%
										</p>
									</div>
									<Progress
										value={
											(isServerRendering
												? serverRenderState.progress
												: progress) * 100
										}
										className="w-full"
									/>
								</div>

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									Cancel
								</Button>
							</div>
						)}

						{serverRenderState.status === "complete" &&
							serverRenderState.downloadUrl && (
								<div className="space-y-3 p-3">
									<div className="rounded-md border border-constructive/30 bg-constructive/10 p-3">
										<p className="text-sm font-medium">Vídeo pronto</p>
										<p className="mt-1 text-xs text-muted-foreground">
											O download começou na aba de renderização.
										</p>
									</div>
									<Button asChild className="w-full gap-2">
										<a href={serverRenderState.downloadUrl} download>
											<Download className="size-4" /> Baixar novamente
										</a>
									</Button>
									<Button
										variant="outline"
										className="w-full"
										onClick={() =>
											setServerRenderState(initialServerRenderState)
										}
									>
										Novo export
									</Button>
								</div>
							)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Export failed</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Retry
				</Button>
			</div>
		</div>
	);
}
