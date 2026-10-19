import { removeElementKeyframe, upsertPathKeyframe } from "@/animation";
import type {
	AnimationInterpolation,
	AnimationPath,
	ElementAnimations,
} from "@/animation/types";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import type { VisualElement } from "@/timeline";
import {
	mediaTime,
	mediaTimeFromSeconds,
	minMediaTime,
	maxMediaTime,
	subMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export type TransitionDirection = "in" | "out";
export type TransitionIcon =
	| "fade"
	| "left"
	| "right"
	| "up"
	| "down"
	| "zoom"
	| "spin";

export type TransitionPresetId =
	| "in-fade"
	| "in-left"
	| "in-right"
	| "in-up"
	| "in-down"
	| "in-zoom"
	| "in-spin"
	| "out-fade"
	| "out-left"
	| "out-right"
	| "out-up"
	| "out-down"
	| "out-zoom"
	| "out-spin";

export interface TransitionPreset {
	id: TransitionPresetId;
	direction: TransitionDirection;
	label: string;
	description: string;
	icon: TransitionIcon;
}

export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
	{
		id: "in-fade",
		direction: "in",
		label: "Dissolver",
		description: "Surge suavemente",
		icon: "fade",
	},
	{
		id: "in-left",
		direction: "in",
		label: "Da esquerda",
		description: "Entra pela esquerda",
		icon: "right",
	},
	{
		id: "in-right",
		direction: "in",
		label: "Da direita",
		description: "Entra pela direita",
		icon: "left",
	},
	{
		id: "in-up",
		direction: "in",
		label: "De baixo",
		description: "Sobe para a cena",
		icon: "up",
	},
	{
		id: "in-down",
		direction: "in",
		label: "De cima",
		description: "Desce para a cena",
		icon: "down",
	},
	{
		id: "in-zoom",
		direction: "in",
		label: "Zoom",
		description: "Aproxima e aparece",
		icon: "zoom",
	},
	{
		id: "in-spin",
		direction: "in",
		label: "Giro suave",
		description: "Gira enquanto aparece",
		icon: "spin",
	},
	{
		id: "out-fade",
		direction: "out",
		label: "Dissolver",
		description: "Desaparece suavemente",
		icon: "fade",
	},
	{
		id: "out-left",
		direction: "out",
		label: "Para esquerda",
		description: "Sai pela esquerda",
		icon: "left",
	},
	{
		id: "out-right",
		direction: "out",
		label: "Para direita",
		description: "Sai pela direita",
		icon: "right",
	},
	{
		id: "out-up",
		direction: "out",
		label: "Para cima",
		description: "Sai pela parte superior",
		icon: "up",
	},
	{
		id: "out-down",
		direction: "out",
		label: "Para baixo",
		description: "Sai pela parte inferior",
		icon: "down",
	},
	{
		id: "out-zoom",
		direction: "out",
		label: "Zoom",
		description: "Afasta e desaparece",
		icon: "zoom",
	},
	{
		id: "out-spin",
		direction: "out",
		label: "Giro suave",
		description: "Gira enquanto desaparece",
		icon: "spin",
	},
] as const;

const TRANSITION_PATHS = [
	"opacity",
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const satisfies readonly AnimationPath[];

type TransitionPoint = "from" | "to";

interface TransitionKeyframe {
	propertyPath: (typeof TRANSITION_PATHS)[number];
	point: TransitionPoint;
	time: MediaTime;
	value: number;
	interpolation?: AnimationInterpolation;
}

function keyframeId({
	direction,
	propertyPath,
	point,
}: {
	direction: TransitionDirection;
	propertyPath: AnimationPath;
	point: TransitionPoint;
}) {
	return `opencut-transition-${direction}-${propertyPath.replaceAll(".", "-")}-${point}`;
}

function clearTransition({
	animations,
	direction,
}: {
	animations: ElementAnimations | undefined;
	direction: TransitionDirection;
}) {
	let nextAnimations = animations;
	for (const propertyPath of TRANSITION_PATHS) {
		for (const point of ["from", "to"] as const) {
			nextAnimations = removeElementKeyframe({
				animations: nextAnimations,
				propertyPath,
				keyframeId: keyframeId({ direction, propertyPath, point }),
			});
		}
	}
	return nextAnimations;
}

function baseNumber({
	element,
	propertyPath,
	fallback,
}: {
	element: VisualElement;
	propertyPath: string;
	fallback: number;
}) {
	const value = element.params[propertyPath];
	return typeof value === "number" ? value : fallback;
}

export function buildTransitionAnimations({
	element,
	preset,
	durationSeconds,
	canvasWidth,
	canvasHeight,
}: {
	element: VisualElement;
	preset: TransitionPreset;
	durationSeconds: number;
	canvasWidth: number;
	canvasHeight: number;
}): ElementAnimations | undefined {
	let animations = clearTransition({
		animations: element.animations,
		direction: preset.direction,
	});
	const requestedDuration = mediaTimeFromSeconds({
		seconds: Math.max(0.1, durationSeconds),
	});
	const duration = maxMediaTime({
		a: mediaTime({ ticks: 1 }),
		b: minMediaTime({
			a: requestedDuration,
			b: mediaTime({ ticks: Math.floor(element.duration / 2) }),
		}),
	});
	const start =
		preset.direction === "in"
			? ZERO_MEDIA_TIME
			: subMediaTime({ a: element.duration, b: duration });
	const end = preset.direction === "in" ? duration : element.duration;
	const baseOpacity = baseNumber({
		element,
		propertyPath: "opacity",
		fallback: 1,
	});
	const baseX = baseNumber({
		element,
		propertyPath: "transform.positionX",
		fallback: 0,
	});
	const baseY = baseNumber({
		element,
		propertyPath: "transform.positionY",
		fallback: 0,
	});
	const baseScaleX = baseNumber({
		element,
		propertyPath: "transform.scaleX",
		fallback: 1,
	});
	const baseScaleY = baseNumber({
		element,
		propertyPath: "transform.scaleY",
		fallback: 1,
	});
	const baseRotate = baseNumber({
		element,
		propertyPath: "transform.rotate",
		fallback: 0,
	});
	const frames: TransitionKeyframe[] = [];
	const addPair = ({
		propertyPath,
		from,
		to,
	}: {
		propertyPath: TransitionKeyframe["propertyPath"];
		from: number;
		to: number;
	}) => {
		frames.push(
			{
				propertyPath,
				point: "from",
				time: start,
				value: from,
				interpolation: "bezier",
			},
			{
				propertyPath,
				point: "to",
				time: end,
				value: to,
				interpolation: "bezier",
			},
		);
	};
	const inTransition = preset.direction === "in";
	const appear = () =>
		addPair({
			propertyPath: "opacity",
			from: inTransition ? 0 : baseOpacity,
			to: inTransition ? baseOpacity : 0,
		});

	switch (preset.icon) {
		case "fade":
			appear();
			break;
		case "left":
			addPair({
				propertyPath: "transform.positionX",
				from: inTransition ? baseX - canvasWidth : baseX,
				to: inTransition ? baseX : baseX - canvasWidth,
			});
			appear();
			break;
		case "right":
			addPair({
				propertyPath: "transform.positionX",
				from: inTransition ? baseX + canvasWidth : baseX,
				to: inTransition ? baseX : baseX + canvasWidth,
			});
			appear();
			break;
		case "up":
			addPair({
				propertyPath: "transform.positionY",
				from: inTransition ? baseY + canvasHeight : baseY,
				to: inTransition ? baseY : baseY - canvasHeight,
			});
			appear();
			break;
		case "down":
			addPair({
				propertyPath: "transform.positionY",
				from: inTransition ? baseY - canvasHeight : baseY,
				to: inTransition ? baseY : baseY + canvasHeight,
			});
			appear();
			break;
		case "zoom":
			addPair({
				propertyPath: "transform.scaleX",
				from: inTransition ? baseScaleX * 0.72 : baseScaleX,
				to: inTransition ? baseScaleX : baseScaleX * 1.28,
			});
			addPair({
				propertyPath: "transform.scaleY",
				from: inTransition ? baseScaleY * 0.72 : baseScaleY,
				to: inTransition ? baseScaleY : baseScaleY * 1.28,
			});
			appear();
			break;
		case "spin":
			addPair({
				propertyPath: "transform.rotate",
				from: inTransition ? baseRotate - 24 : baseRotate,
				to: inTransition ? baseRotate : baseRotate + 24,
			});
			addPair({
				propertyPath: "transform.scaleX",
				from: inTransition ? baseScaleX * 0.82 : baseScaleX,
				to: inTransition ? baseScaleX : baseScaleX * 0.82,
			});
			addPair({
				propertyPath: "transform.scaleY",
				from: inTransition ? baseScaleY * 0.82 : baseScaleY,
				to: inTransition ? baseScaleY : baseScaleY * 0.82,
			});
			appear();
			break;
	}

	for (const frame of frames) {
		const target = resolveAnimationTarget({
			element,
			path: frame.propertyPath,
		});
		if (!target) continue;
		animations = upsertPathKeyframe({
			animations,
			propertyPath: frame.propertyPath,
			time: frame.time,
			value: frame.value,
			interpolation: frame.interpolation,
			keyframeId: keyframeId({
				direction: preset.direction,
				propertyPath: frame.propertyPath,
				point: frame.point,
			}),
			channelLayout: target.channelLayout,
			coerceValue: target.coerceValue,
		});
	}

	return animations;
}

export function removeTransitionAnimations({
	element,
	direction,
}: {
	element: VisualElement;
	direction: TransitionDirection;
}) {
	return clearTransition({ animations: element.animations, direction });
}
