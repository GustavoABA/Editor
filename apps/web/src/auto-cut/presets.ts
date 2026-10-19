import type { AutoCutOptions, AutoCutPresetId } from "./types";

export const AUTO_CUT_PRESETS: Record<
	AutoCutPresetId,
	{ label: string; description: string; options: AutoCutOptions }
> = {
	gentle: {
		label: "Leve",
		description: "Remove apenas pausas longas e preserva a respiração.",
		options: {
			thresholdDb: -48,
			minSilenceMs: 900,
			paddingMs: 160,
			minClipMs: 500,
		},
	},
	balanced: {
		label: "Equilibrado",
		description: "Bom ponto de partida para fala, aulas e vídeos sociais.",
		options: {
			thresholdDb: -42,
			minSilenceMs: 600,
			paddingMs: 120,
			minClipMs: 350,
		},
	},
	dynamic: {
		label: "Dinâmico",
		description: "Ritmo rápido; remove pausas curtas com mais agressividade.",
		options: {
			thresholdDb: -36,
			minSilenceMs: 350,
			paddingMs: 80,
			minClipMs: 200,
		},
	},
};

