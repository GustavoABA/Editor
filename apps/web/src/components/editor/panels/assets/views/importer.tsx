"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PanelView } from "./base-panel";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { toast } from "sonner";
import { useAssetsPanelStore } from "../assets-panel-store";

const IMPORTER_URL = "/importer/";

type ImporterJob = { id: string; status: string; files?: { name: string }[] };

function isImporterJob(value: unknown): value is ImporterJob {
	if (!value || typeof value !== "object") return false;
	return (
		"id" in value &&
		"status" in value &&
		typeof value.id === "string" &&
		typeof value.status === "string"
	);
}

function storedJobIds(): string[] {
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem("ytdlui.jobs") ?? "[]",
		);
		if (!Array.isArray(stored)) return [];
		return stored
			.map((job) =>
				typeof job === "object" && job && "id" in job ? job.id : null,
			)
			.filter((id): id is string => typeof id === "string")
			.slice(0, 30);
	} catch {
		return [];
	}
}

export function ImporterView() {
	const editor = useEditor();
	const activeProject = useEditor((currentEditor) =>
		currentEditor.project.getActiveOrNull(),
	);
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const [isImporterOpen, setIsImporterOpen] = useState(false);
	const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
	const [readyJobs, setReadyJobs] = useState<ImporterJob[]>([]);
	const [isImporting, setIsImporting] = useState(false);

	const checkImporter = useCallback(async () => {
		try {
			const response = await fetch(`${IMPORTER_URL}api/health`, {
				cache: "no-store",
			});
			setIsAvailable(response.ok);
			return response.ok;
		} catch {
			setIsAvailable(false);
			return false;
		}
	}, []);

	const refreshReadyJobs = useCallback(async () => {
		const ids = storedJobIds();
		if (!ids.length) {
			setReadyJobs([]);
			return;
		}
		try {
			const response = await fetch(
				`${IMPORTER_URL}api/jobs?ids=${encodeURIComponent(ids.join(","))}`,
				{ cache: "no-store" },
			);
			if (!response.ok) return;
			const payload: unknown = await response.json();
			if (!payload || typeof payload !== "object") return;
			if (!("jobs" in payload)) return;
			const { jobs } = payload;
			if (!Array.isArray(jobs)) return;
			setReadyJobs(
				jobs.filter(isImporterJob).filter((job) => job.status === "done"),
			);
		} catch {
			// The availability message remains visible; polling should not interrupt editing.
		}
	}, []);

	useEffect(() => {
		if (!isImporterOpen || !isAvailable) return;
		const timer = window.setInterval(() => void refreshReadyJobs(), 2_000);
		return () => window.clearInterval(timer);
	}, [isAvailable, isImporterOpen, refreshReadyJobs]);

	const readyFileCount = useMemo(
		() => readyJobs.reduce((count, job) => count + (job.files?.length ?? 1), 0),
		[readyJobs],
	);

	const openImporter = async () => {
		if (await checkImporter()) {
			setIsImporterOpen(true);
			return;
		}
		toast.error("O serviço de importação não está ativo neste host.");
	};

	const openInWindow = async () => {
		if (await checkImporter()) {
			window.open(IMPORTER_URL, "cut-editor-importer", "noopener,noreferrer");
			return;
		}
		toast.error("O serviço de importação não está ativo neste host.");
	};

	const importReadyDownloads = async () => {
		if (!activeProject || !readyJobs.length || isImporting) return;
		setIsImporting(true);
		try {
			const files = await Promise.all(
				readyJobs.flatMap((job) => {
					const entries = job.files?.length ? job.files : [{ name: "media" }];
					return entries.map(async (entry, index) => {
						const suffix = entries.length > 1 ? `/files/${index}` : "/file";
						const response = await fetch(
							`${IMPORTER_URL}api/jobs/${job.id}${suffix}`,
						);
						if (!response.ok)
							throw new Error(`Não foi possível obter ${entry.name}.`);
						const blob = await response.blob();
						return new File([blob], entry.name, { type: blob.type });
					});
				}),
			);
			const result = await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const assets = await processMediaAssets({ files });
					return {
						assets,
						uploadedCount: assets.length,
						assetNames: assets.map((asset) => asset.name),
					};
				},
			});
			for (const asset of result.assets) {
				await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset,
				});
			}
			setReadyJobs([]);
			setIsImporterOpen(false);
			setActiveTab("media");
			toast.success(
				`${result.assets.length} mídia(s) adicionada(s) à biblioteca.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Não foi possível importar as mídias.",
			);
		} finally {
			setIsImporting(false);
		}
	};
	return (
		<PanelView title="Importar por link" contentClassName="pb-3">
			<div className="space-y-3 text-sm">
				<div className="rounded-md border bg-muted/30 p-3">
					<p className="font-medium">Importador web opcional</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Cole um link no importador para baixar uma cópia local da mídia, sem
						precisar de chave de API. Use apenas conteúdo que você possui ou tem
						autorização para baixar e editar.
					</p>
					<code className="mt-3 block overflow-x-auto rounded bg-background p-2 text-[11px]">
						docker compose --profile importer up -d importer
					</code>
					<p className="mt-2 text-xs text-muted-foreground">
						Execute esse comando uma vez no dispositivo que hospeda o Cut
						Editor. Quando o download terminar, use o botão de adicionar à
						biblioteca para colocá-lo no projeto sem escolher o arquivo
						novamente.
					</p>
					<Button
						className="mt-3"
						size="sm"
						onClick={() => void openImporter()}
					>
						Iniciar importador
					</Button>
					{isAvailable === false && (
						<p className="mt-2 text-xs text-amber-600">
							Serviço indisponível. Inicie-o no host e tente novamente.
						</p>
					)}
					{readyFileCount > 0 && (
						<Button
							className="mt-3"
							size="sm"
							variant="secondary"
							disabled={!activeProject || isImporting}
							onClick={() => void importReadyDownloads()}
						>
							{isImporting
								? "Adicionando à biblioteca…"
								: `Adicionar ${readyFileCount} download(s) à biblioteca`}
						</Button>
					)}
					<Button
						className="mt-3"
						size="sm"
						variant="outline"
						onClick={() => void openInWindow()}
					>
						Abrir em outra janela
					</Button>
				</div>

				<Dialog open={isImporterOpen} onOpenChange={setIsImporterOpen}>
					<DialogContent className="h-[85vh] max-w-6xl overflow-hidden p-0">
						<DialogHeader className="sr-only">
							<DialogTitle>Importador de mídia</DialogTitle>
							<DialogDescription>
								Baixe mídia autorizada para importação no Cut Editor.
							</DialogDescription>
						</DialogHeader>
						<div className="size-full overflow-hidden rounded-md bg-background p-10 pt-14">
							<iframe
								title="Importador de mídia"
								src={IMPORTER_URL}
								className="size-full border-0"
								sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
								referrerPolicy="same-origin"
							/>
						</div>
						{readyFileCount > 0 && (
							<div className="absolute right-16 bottom-3">
								<Button
									size="sm"
									disabled={!activeProject || isImporting}
									onClick={() => void importReadyDownloads()}
								>
									Adicionar à biblioteca
								</Button>
							</div>
						)}
					</DialogContent>
				</Dialog>
			</div>
		</PanelView>
	);
}
