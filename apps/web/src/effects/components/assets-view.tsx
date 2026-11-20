"use client";

import { useEffect, useRef, useCallback } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import { toast } from "sonner";
import type { EffectDefinition } from "@/effects/types";

export function EffectsView() {
	const effects = effectsRegistry.getAll();

	return (
		<PanelView title="Efeitos (aplicados ao clipe)">
			<p className="text-muted-foreground px-2 pb-2 text-xs">Selecione um clipe na timeline, depois clique no efeito. Você também pode arrastar o efeito diretamente sobre o clipe.</p>
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();

	const handleAddToTimeline = useCallback(() => {
		const selected = editor.selection.getSelectedElements();
		const tracks = editor.scenes.getActiveScene().tracks;
		const allTracks = [tracks.main, ...tracks.overlay, ...tracks.audio];
		let added = 0;
		for (const selectedElement of selected) {
			const track = allTracks.find((t) => t.id === selectedElement.trackId);
			const element = track?.elements.find((el) => el.id === selectedElement.elementId);
			if (!element || !isVisualElement(element) || element.locked) continue;
			editor.timeline.addClipEffect({
				trackId: selectedElement.trackId,
				elementId: selectedElement.elementId,
				effectType: effect.type,
			});
			added++;
		}
		if (added > 0) {
			toast.success(`${effect.name} aplicado em ${added} clipe(s). Acesse Propriedades → Efeitos para remover ou ajustar.`);
		} else {
			toast.info("Selecione um vídeo, imagem ou elemento visual desbloqueado antes de aplicar o efeito.");
		}
	}, [editor, effect.type, effect.name]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
