"use client";

import { PanelView } from "./base-panel";
import { LinksImportPanel } from "./links";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { toast } from "sonner";

export function ImporterView() {
	const editor = useEditor();
	return (
		<PanelView title="Importar link" contentClassName="pb-3">
			<p className="mb-3 text-xs text-muted-foreground">Abra e reproduza links dentro do Editor. Arquivos diretos autorizados podem entrar na biblioteca e na timeline, sem serviço externo de download.</p>
			<LinksImportPanel onImport={async (file) => {
				const project = editor.project.getActiveOrNull();
				if (!project) throw new Error("Abra um projeto primeiro.");
				const assets = await processMediaAssets({ files: [file] });
				if (!assets.length) throw new Error("Formato de mídia não suportado.");
				if (editor.project.getActiveOrNull()?.metadata.id !== project.metadata.id) throw new Error("O projeto mudou durante a importação.");
				for (const asset of assets) await editor.media.addMediaAsset({ projectId: project.metadata.id, asset });
				toast.info("Mídia disponível na aba Assets para arrastar à timeline.");
			}} />
		</PanelView>
	);
}
