"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PanelView } from "./base-panel";

const IMPORTER_URL = "/importer/";

export function ImporterView() {
	const [isImporterOpen, setIsImporterOpen] = useState(false);
	const openInWindow = () => {
		window.open(IMPORTER_URL, "cut-editor-importer", "noopener,noreferrer");
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
						Editor. Quando terminar o download, selecione o arquivo na aba Media
						para adicioná-lo ao projeto.
					</p>
					<Button
						className="mt-3"
						size="sm"
						onClick={() => setIsImporterOpen(true)}
					>
						Iniciar importador
					</Button>
					<Button
						className="mt-3"
						size="sm"
						variant="outline"
						onClick={openInWindow}
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
					</DialogContent>
				</Dialog>
			</div>
		</PanelView>
	);
}
