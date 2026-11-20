import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState } from "react";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import { transcriptionService } from "@/services/transcription/service";
import { getLanToken } from "@/lan-sync/client";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import type { SubtitleCue } from "@/subtitles/types";
import {
	applyCaptionPresentation,
	CAPTION_PRESETS,
	type CaptionPlacement,
	type CaptionPreset,
	updateExistingCaptionPresentation,
} from "@/subtitles/presets";
import { toast } from "sonner";
import { getTextAnimationKeyframes, type TextMotionPreset } from "@/text/motion-presets";
import { TICKS_PER_SECOND } from "@/wasm";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

function isCaptionPreset(value: string): value is CaptionPreset {
	return value === "clean" || value === "box" || value === "social";
}

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [placement, setPlacement] = useState<CaptionPlacement>("bottom");
	const [preset, setPreset] = useState<CaptionPreset>("clean");
	const [captionColor, setCaptionColor] = useState("#ffffff");
	const [captionMotion, setCaptionMotion] = useState<"none" | TextMotionPreset>("none");
	const [motionSeconds, setMotionSeconds] = useState(0.3);
	const [wordsPerCaption, setWordsPerCaption] = useState(5);
	const [transcriptionEngine, setTranscriptionEngine] = useState<"parakeet" | "whisper">("parakeet");
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: "Transcribing..." });
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: SubtitleCue[];
	}): boolean => {
		const presentedCaptions = captions.map((caption) =>
			applyCaptionPresentation({ caption, placement, preset, color: captionColor }),
		);
		const trackId = insertCaptionChunksAsTextTrack({
			editor,
			captions: presentedCaptions,
		});
		if (trackId && captionMotion !== "none") {
			applyMotionToCaptionTrack({ trackId });
		}
		return trackId !== null;
	};

	const applyMotionToCaptionTrack = ({ trackId }: { trackId?: string }) => {
		if (captionMotion === "none") return;
		const tracks = editor.scenes.getActiveScene().tracks.overlay.filter(
			(track) => track.type === "text" && (!trackId || track.id === trackId),
		);
		const texts = tracks.flatMap((track) => track.elements.filter((element) =>
			!element.locked && (element.params["subtitle.isCaption"] === true ||
				element.name.toLowerCase().startsWith("caption ")),
		).map((element) => ({ element, trackId: track.id })));
		const keyframes = texts.flatMap(({ element, trackId }) => getTextAnimationKeyframes({
			ref: { trackId, elementId: element.id }, element,
			durationTicks: element.duration,
			transitionTicks: Math.round(Math.max(0.05, Math.min(2, motionSeconds)) * TICKS_PER_SECOND),
			motion: captionMotion, position: "both",
		}));
		if (keyframes.length) editor.timeline.upsertKeyframes({ keyframes });
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: "Extracting audio..." });
		try {
			const audioBlob = await extractTimelineAudio({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			dispatch({ type: "update_step", step: "Preparing audio..." });
			const result = transcriptionEngine === "parakeet"
				? await (async () => {
					const token = getLanToken();
					if (!token) throw new Error("Conecte-se ao servidor LAN antes de utilizar Parakeet Redux (CPU).");
					dispatch({ type: "update_step", step: "Parakeet Redux · CPU no host..." });
					const response = await fetch("/api/transcription/parakeet", {
						method: "POST",
						headers: { "Content-Type": "audio/wav", "x-lan-sync-token": token },
						body: audioBlob,
						signal: AbortSignal.timeout(245_000),
					});
					const body: unknown = await response.json().catch(() => null);
					if (!response.ok || !body || typeof body !== "object") {
						const error = body && typeof body === "object" && "error" in body &&
							typeof body.error === "string" ? body.error : "Parakeet indisponível.";
						throw new Error(error + " Se necessário, selecione Whisper (compatibilidade).");
					}
					const transcript = body as Record<string, unknown>;
					if (!Array.isArray(transcript.segments)) throw new Error("Segmentos inválidos do Parakeet.");
					return {
						text: typeof transcript.text === "string" ? transcript.text : "",
						segments: transcript.segments as Array<{ text: string; start: number; end: number }>,
						language: typeof transcript.language === "string" ? transcript.language : "auto",
					};
				})()
				: await (async () => {
					const { samples } = await decodeAudioToFloat32({
						audioBlob,
						sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
					});
					return transcriptionService.transcribe({
						audioData: samples,
						language: selectedLanguage === "auto" ? undefined : selectedLanguage,
						onProgress: handleProgress,
					});
				})();

			dispatch({ type: "update_step", step: "Generating captions..." });
			const captionChunks = buildCaptionChunks({
				segments: result.segments,
				wordsPerChunk: wordsPerCaption,
			});

			if (!insertCaptions({ captions: captionChunks })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const handleApplyToExisting = () => {
		const updated = updateExistingCaptionPresentation({
			editor,
			placement,
			preset,
			color: captionColor,
		});
		if (updated && captionMotion !== "none") applyMotionToCaptionTrack({});
		if (updated === 0) {
			toast.info("Nenhuma legenda existente foi encontrada");
			return;
		}
		toast.success(
			`${updated} legenda${updated === 1 ? "" : "s"} atualizada${updated === 1 ? "" : "s"}`,
		);
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Motor de transcrição">
							<Select value={transcriptionEngine}
								onValueChange={(value) => setTranscriptionEngine(value === "whisper" ? "whisper" : "parakeet")}>
								<SelectTrigger><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="parakeet">Parakeet Redux · CPU no host</SelectItem>
									<SelectItem value="whisper">Whisper · compatibilidade no navegador</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-muted-foreground text-[11px]">Parakeet requer o serviço opcional Docker e conexão ao host; não usa chave de IA paga.</p>
						</SectionField>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Posição">
							<div className="grid grid-cols-3 gap-1">
								{(["top", "middle", "bottom"] as const).map((value) => (
									<Button
										key={value}
										type="button"
										size="sm"
										variant={placement === value ? "secondary" : "outline"}
										onClick={() => setPlacement(value)}
										disabled={isProcessing}
										className="px-1 text-xs"
									>
										{value === "top"
											? "Em cima"
											: value === "middle"
												? "No meio"
												: "Embaixo"}
									</Button>
								))}
							</div>
						</SectionField>
						<SectionField label="Estilo">
							<Select
								value={preset}
								onValueChange={(value) => {
									if (isCaptionPreset(value)) setPreset(value);
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(CAPTION_PRESETS).map(([value, item]) => (
										<SelectItem key={value} value={value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Cor da legenda">
							<label className="flex items-center gap-2 text-xs">
								<input type="color" aria-label="Escolher cor da legenda" value={captionColor}
									onChange={(event) => setCaptionColor(event.target.value)} disabled={isProcessing} />
								<span>{captionColor}</span>
							</label>
						</SectionField>
						<SectionField label="Animação de entrada e saída">
							<select aria-label="Animação da legenda" value={captionMotion}
								onChange={(event) => setCaptionMotion(event.target.value as "none" | TextMotionPreset)}
								className="bg-background w-full rounded border px-2 py-1 text-xs" disabled={isProcessing}>
								<option value="none">Sem animação</option>
								<option value="fade">Fade (aparecer/desaparecer)</option>
								<option value="slide">Deslizar</option>
								<option value="scale">Zoom</option>
							</select>
							<label className="flex items-center gap-2 text-xs mt-2">
								Duração (segundos)
								<input type="number" value={motionSeconds} step={0.05} min={0.05} max={2}
									onChange={(event) => setMotionSeconds(Number(event.target.value))}
									className="bg-background w-20 rounded border px-2 py-1" disabled={isProcessing} />
							</label>
						</SectionField>
						<SectionField label="Palavras por legenda">
							<Select
								value={String(wordsPerCaption)}
								onValueChange={(value) => setWordsPerCaption(Number(value))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="3">3 — rápido</SelectItem>
									<SelectItem value="5">5 — equilibrado</SelectItem>
									<SelectItem value="7">7 — compacto</SelectItem>
								</SelectContent>
							</Select>
						</SectionField>
					</SectionFields>

					<Button
						type="button"
						variant="outline"
						onClick={handleApplyToExisting}
						disabled={isProcessing}
					>
						Aplicar às legendas existentes
					</Button>

					<Button
						type="button"
						className="mt-auto w-full"
						onClick={handleGenerateTranscript}
						disabled={isProcessing || activeDiagnostics.length > 0}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? processing.step : "Generate transcript"}
					</Button>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
