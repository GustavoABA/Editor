"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { activityLog } from "@/diagnostics/activity-log";

export function LogsSettings() {
	const entries = useSyncExternalStore(
		(listener) => activityLog.subscribe(listener),
		() => activityLog.getEntries(),
		() => [],
	);

	const copy = async () => {
		await navigator.clipboard.writeText(activityLog.toText());
	};
	const download = () => {
		const blob = new Blob([activityLog.toText()], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `cut-editor-log-${new Date().toISOString().replaceAll(":", "-")}.txt`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	return (
		<section className="flex flex-col gap-3 p-3" aria-label="Logs da sessão">
		<div>
			<h3 className="text-sm font-semibold">Logs da sessão</h3>
			<p className="text-muted-foreground text-xs">
				Ações de edição e erros desta sessão. Ficam somente neste navegador,
				são apagados ao sair do editor ou após cinco horas e não incluem chaves ou mídias.
			</p>
		</div>
		<div className="flex flex-wrap gap-2">
			<Button size="sm" variant="outline" onClick={() => void copy()} disabled={!entries.length}>Copiar</Button>
			<Button size="sm" variant="outline" onClick={download} disabled={!entries.length}>Baixar</Button>
			<Button size="sm" variant="ghost" onClick={() => activityLog.clear()} disabled={!entries.length}>Limpar</Button>
		</div>
		<div className="max-h-96 overflow-auto rounded border bg-muted/20 p-2 font-mono text-[11px]" aria-live="polite">
			{entries.length === 0 ? <p className="text-muted-foreground">Nenhuma atividade registrada ainda.</p> : entries.slice().reverse().map((entry) => (
				<p key={entry.id} className={entry.level === "error" ? "text-destructive" : entry.level === "warn" ? "text-yellow-700 dark:text-yellow-300" : ""}>
					[{new Date(entry.at).toLocaleTimeString()}] {entry.level.toUpperCase()} · {entry.source}: {entry.message}
				</p>
			))}
		</div>
		<p className="text-muted-foreground text-[11px]">{entries.length}/1000 eventos mantidos.</p>
		</section>
	);
}
