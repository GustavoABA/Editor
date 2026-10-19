"use client";

import { useMemo, useState } from "react";
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Blend,
	RotateCcw,
	Sparkles,
	ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { isVisualElement } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import {
	buildTransitionAnimations,
	removeTransitionAnimations,
	TRANSITION_PRESETS,
	type TransitionDirection,
	type TransitionIcon,
	type TransitionPreset,
} from "@/transitions/presets";

const iconMap = {
	fade: Blend,
	left: ArrowLeft,
	right: ArrowRight,
	up: ArrowUp,
	down: ArrowDown,
	zoom: ZoomIn,
	spin: RotateCcw,
} satisfies Record<TransitionIcon, typeof Blend>;

export function TransitionsView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const [direction, setDirection] = useState<TransitionDirection>("in");
	const [durationSeconds, setDurationSeconds] = useState(0.5);
	const selected = useMemo(() => {
		if (selectedElements.length !== 1) return null;
		const [result] = editor.timeline.getElementsWithTracks({
			elements: selectedElements,
		});
		return result && isVisualElement(result.element)
			? { trackId: result.track.id, element: result.element }
			: null;
	}, [editor, selectedElements]);
	const presets = TRANSITION_PRESETS.filter(
		(preset) => preset.direction === direction,
	);

	const applyPreset = ({ preset }: { preset: TransitionPreset }) => {
		if (!selected) return;
		const canvas = editor.project.getActive().settings.canvasSize;
		const animations = buildTransitionAnimations({
			element: selected.element,
			preset,
			durationSeconds,
			canvasWidth: canvas.width,
			canvasHeight: canvas.height,
		});
		editor.timeline.updateElements({
			updates: [
				{
					trackId: selected.trackId,
					elementId: selected.element.id,
					patch: { animations },
				},
			],
		});
		toast.success(`${preset.label} aplicado`, {
			description: `${direction === "in" ? "Entrada" : "Saída"} de ${durationSeconds.toFixed(2)} s`,
		});
	};

	const removeTransition = () => {
		if (!selected) return;
		editor.timeline.updateElements({
			updates: [
				{
					trackId: selected.trackId,
					elementId: selected.element.id,
					patch: {
						animations: removeTransitionAnimations({
							element: selected.element,
							direction,
						}),
					},
				},
			],
		});
		toast.success("Transição removida");
	};

	return (
		<PanelView title="Transições" contentClassName="pb-4">
			{!selected ? (
				<TransitionEmptyState multiple={selectedElements.length > 1} />
			) : (
				<div className="space-y-4">
					<div className="rounded-md border bg-muted/20 p-3">
						<div className="flex items-center gap-2">
							<Sparkles className="size-4 text-primary" />
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">
									{selected.element.name}
								</p>
								<p className="text-xs text-muted-foreground">
									Escolha um efeito para aplicar ao clipe selecionado.
								</p>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
						{(["in", "out"] as const).map((value) => (
							<Button
								key={value}
								variant={direction === value ? "background" : "ghost"}
								size="sm"
								className="w-full"
								onClick={() => setDirection(value)}
							>
								{value === "in" ? "Entrada" : "Saída"}
							</Button>
						))}
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground">Duração</span>
							<span className="font-medium tabular-nums">
								{durationSeconds.toFixed(2)} s
							</span>
						</div>
						<Slider
							aria-label="Duração da transição"
							min={0.1}
							max={2}
							step={0.05}
							value={[durationSeconds]}
							onValueChange={([value]) =>
								value != null && setDurationSeconds(value)
							}
						/>
					</div>

					<div className="grid grid-cols-2 gap-2">
						{presets.map((preset) => (
							<TransitionCard
								key={preset.id}
								preset={preset}
								onClick={() => applyPreset({ preset })}
							/>
						))}
					</div>

					<Button
						variant="outline"
						size="sm"
						className="w-full"
						onClick={removeTransition}
					>
						Remover transição de {direction === "in" ? "entrada" : "saída"}
					</Button>
				</div>
			)}
		</PanelView>
	);
}

function TransitionCard({
	preset,
	onClick,
}: {
	preset: TransitionPreset;
	onClick: () => void;
}) {
	const Icon = iconMap[preset.icon];
	return (
		<button
			type="button"
			className={cn(
				"group rounded-md border bg-background p-2 text-left",
				"transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
			)}
			onClick={onClick}
			aria-label={`Aplicar ${preset.label}: ${preset.description}`}
		>
			<div className="mb-2 flex h-12 items-center justify-center overflow-hidden rounded bg-muted/40">
				<div className="flex size-8 items-center justify-center rounded border bg-background shadow-sm transition-transform duration-300 group-hover:scale-110">
					<Icon className="size-4 text-primary" />
				</div>
			</div>
			<p className="truncate text-xs font-medium">{preset.label}</p>
			<p className="truncate text-[0.65rem] text-muted-foreground">
				{preset.description}
			</p>
		</button>
	);
}

function TransitionEmptyState({ multiple }: { multiple: boolean }) {
	return (
		<div className="flex h-full min-h-52 flex-col items-center justify-center px-3 text-center">
			<div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
				<Sparkles className="size-5 text-muted-foreground" />
			</div>
			<p className="text-sm font-medium">
				{multiple ? "Selecione apenas um clipe" : "Selecione um clipe visual"}
			</p>
			<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
				Vídeos, imagens, textos, stickers e formas aceitam transições.
			</p>
		</div>
	);
}
