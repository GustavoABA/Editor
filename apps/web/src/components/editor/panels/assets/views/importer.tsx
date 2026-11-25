"use client";

import { Button } from "@/components/ui/button";
import { PanelView } from "./base-panel";

const IMPORTER_URL = "/importer/";

export function ImporterView() {
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
						variant="outline"
						onClick={openInWindow}
					>
						Abrir em janela
					</Button>
				</div>

				<div className="aspect-[4/5] min-h-80 overflow-hidden rounded-md border bg-background">
					<iframe
						title="Importador de mídia"
						src={IMPORTER_URL}
						className="size-full border-0"
						sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
						referrerPolicy="same-origin"
					/>
				</div>
			</div>
		</PanelView>
	);
}
