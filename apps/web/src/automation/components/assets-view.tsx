"use client";

import { useState } from "react";
import { CheckCircle2, Scissors, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
	analyzeTimelineForAutoCut,
	applyAutoCutAnalysis,
} from "@/auto-cut/service";
import { AUTO_CUT_PRESETS } from "@/auto-cut/presets";
import type { AutoCutAnalysis, AutoCutPresetId } from "@/auto-cut/types";
import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { AutomationConnections } from "./connections";
import { OllamaAssistant } from "./ollama-assistant";

function formatSeconds(seconds: number): string {
	if (seconds < 60) return `${seconds.toFixed(1)} s`;
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	return `${minutes} min ${rest} s`;
}

function isAutoCutPresetId(value: string): value is AutoCutPresetId {
	return value === "gentle" || value === "balanced" || value === "dynamic";
}

export function AutomationView() {
	const editor = useEditor();
	const diagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);
	const [preset, setPreset] = useState<AutoCutPresetId>("balanced");
	const [analysis, setAnalysis] = useState<AutoCutAnalysis | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [step, setStep] = useState("");

	const handleAnalyze = async () => {
		setIsAnalyzing(true);
		setAnalysis(null);
		try {
			const result = await analyzeTimelineForAutoCut({
				editor,
				preset,
				onProgress: setStep,
			});
			setAnalysis(result);
			setStep("");
			if (result.cutRanges.length === 0) {
				toast.info("Nenhuma pausa longa foi encontrada com este perfil");
			}
		} catch (error) {
			toast.error("Falha ao analisar a timeline", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsAnalyzing(false);
		}
	};

	const handleApply = () => {
		if (!analysis || analysis.cutRanges.length === 0) return;
		applyAutoCutAnalysis({ editor, analysis });
		toast.success("Auto Cut aplicado", {
			description: `${formatSeconds(analysis.removedDurationSeconds)} removidos. Use Ctrl+Z para desfazer.`,
		});
		setAnalysis(null);
	};

	return (
		<PanelView
			title="IA & Automação"
			contentClassName="flex h-full flex-col gap-4"
		>
			<OllamaAssistant />

			<section className="space-y-3 rounded-lg border bg-muted/20 p-3">
				<div className="flex items-start gap-2">
					<div className="rounded-md bg-primary/10 p-2 text-primary">
						<Scissors className="size-4" />
					</div>
					<div>
						<h3 className="text-sm font-medium">Auto Cut local</h3>
						<p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
							Analisa o vídeo inteiro e remove silêncios no computador servidor.
						</p>
					</div>
				</div>

				<Select
					value={preset}
					onValueChange={(value) => {
						if (!isAutoCutPresetId(value)) return;
						setPreset(value);
						setAnalysis(null);
					}}
					disabled={isAnalyzing}
				>
					<SelectTrigger aria-label="Intensidade do Auto Cut">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(AUTO_CUT_PRESETS).map(([value, item]) => (
							<SelectItem key={value} value={value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					{AUTO_CUT_PRESETS[preset].description}
				</p>

				<Button
					type="button"
					className="w-full gap-2"
					onClick={() => void handleAnalyze()}
					disabled={isAnalyzing || diagnostics.length > 0}
				>
					{isAnalyzing ? <Spinner /> : <Sparkles className="size-4" />}
					{isAnalyzing ? step || "Analisando…" : "Analisar pausas"}
				</Button>

				{diagnostics.length > 0 && (
					<p className="text-caution text-xs">{diagnostics[0]?.message}</p>
				)}

				{analysis && analysis.cutRanges.length > 0 && (
					<div className="space-y-3 rounded-md border bg-background p-3">
						<div className="flex items-center gap-2 text-constructive">
							<CheckCircle2 className="size-4" />
							<span className="text-sm font-medium">Prévia pronta</span>
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="rounded bg-muted p-2">
								<p className="text-muted-foreground">Cortes</p>
								<p className="mt-0.5 text-sm font-medium">
									{analysis.cutRanges.length}
								</p>
							</div>
							<div className="rounded bg-muted p-2">
								<p className="text-muted-foreground">Tempo removido</p>
								<p className="mt-0.5 text-sm font-medium">
									{formatSeconds(analysis.removedDurationSeconds)}
								</p>
							</div>
						</div>
						<Button type="button" className="w-full" onClick={handleApply}>
							Aplicar Auto Cut
						</Button>
					</div>
				)}
			</section>

			<AutomationConnections />
		</PanelView>
	);
}
