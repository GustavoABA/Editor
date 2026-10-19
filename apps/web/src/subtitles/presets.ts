import type { EditorCore } from "@/core";
import type { TextElement } from "@/timeline";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";

export const CAPTION_PLACEMENT_VALUES = ["top", "middle", "bottom"] as const;
export type CaptionPlacement = (typeof CAPTION_PLACEMENT_VALUES)[number];

export const CAPTION_PRESET_VALUES = ["clean", "box", "social"] as const;
export type CaptionPreset = (typeof CAPTION_PRESET_VALUES)[number];

export const CAPTION_PRESETS: Record<
	CaptionPreset,
	{ label: string; description: string; style: SubtitleStyleOverrides }
> = {
	clean: {
		label: "Limpa",
		description: "Branca, sem caixa e fácil de ler",
		style: {
			fontFamily: "Arial",
			fontSize: 5,
			color: "#ffffff",
			fontWeight: "bold",
			background: { enabled: false, color: "#000000" },
		},
	},
	box: {
		label: "Caixa",
		description: "Fundo escuro para cenas claras",
		style: {
			fontFamily: "Arial",
			fontSize: 5,
			color: "#ffffff",
			fontWeight: "bold",
			background: {
				enabled: true,
				color: "#000000D9",
				cornerRadius: 12,
				paddingX: 26,
				paddingY: 22,
			},
		},
	},
	social: {
		label: "Social",
		description: "Amarela e maior para vídeos curtos",
		style: {
			fontFamily: "Arial",
			fontSize: 6,
			color: "#FFE45C",
			fontWeight: "bold",
			background: { enabled: false, color: "#000000" },
		},
	},
};

function mergeStyle({
	base,
	override,
}: {
	base: SubtitleStyleOverrides | undefined;
	override: SubtitleStyleOverrides;
}): SubtitleStyleOverrides {
	return {
		...base,
		...override,
		background: {
			...(base?.background ?? {}),
			...(override.background ?? {}),
			enabled:
				override.background?.enabled ?? base?.background?.enabled ?? false,
			color: override.background?.color ?? base?.background?.color ?? "#000000",
		},
		placement: {
			...(base?.placement ?? {}),
			...(override.placement ?? {}),
		},
	};
}

export function applyCaptionPresentation({
	caption,
	placement,
	preset,
}: {
	caption: SubtitleCue;
	placement: CaptionPlacement;
	preset: CaptionPreset;
}): SubtitleCue {
	return {
		...caption,
		style: mergeStyle({
			base: caption.style,
			override: {
				...CAPTION_PRESETS[preset].style,
				placement: { verticalAlign: placement },
			},
		}),
	};
}

function isCaptionElement(element: TextElement): boolean {
	return (
		element.params["subtitle.isCaption"] === true ||
		element.name.toLowerCase().startsWith("caption ")
	);
}

export function updateExistingCaptionPresentation({
	editor,
	placement,
	preset,
}: {
	editor: EditorCore;
	placement: CaptionPlacement;
	preset: CaptionPreset;
}): number {
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const textTracks = editor.scenes
		.getActiveScene()
		.tracks.overlay.filter((track) => track.type === "text");
	const captions = textTracks.flatMap((track) =>
		track.elements
			.filter(isCaptionElement)
			.map((element) => ({ trackId: track.id, element })),
	);

	const updates = captions.map(({ trackId, element }, index) => {
		const content = String(element.params.content ?? "");
		const rebuilt = buildSubtitleTextElement({
			index,
			caption: applyCaptionPresentation({
				caption: { text: content, startTime: 0, duration: 1 },
				placement,
				preset,
			}),
			canvasSize,
		});
		return {
			trackId,
			elementId: element.id,
			patch: {
				params: {
					...element.params,
					...rebuilt.params,
					content,
				},
			},
		};
	});

	editor.timeline.updateElements({ updates });
	return updates.length;
}

