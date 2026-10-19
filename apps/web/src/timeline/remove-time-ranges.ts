import { splitAnimationsAtTime } from "@/animation";
import { getSourceSpanAtClipTime } from "@/retime";
import { isRetimableElement } from "@/timeline/element-utils";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	mediaTime,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";

export type TimelineCutRange = {
	startTime: MediaTime;
	endTime: MediaTime;
};

function splitElementAtTime({
	element,
	splitTime,
}: {
	element: TimelineElement;
	splitTime: MediaTime;
}): TimelineElement[] {
	const elementEnd = addMediaTime({ a: element.startTime, b: element.duration });
	if (splitTime <= element.startTime || splitTime >= elementEnd) {
		return [element];
	}

	const relativeTime = subMediaTime({ a: splitTime, b: element.startTime });
	const leftVisibleDuration = relativeTime;
	const rightVisibleDuration = subMediaTime({
		a: element.duration,
		b: relativeTime,
	});
	const retime = isRetimableElement(element) ? element.retime : undefined;
	const leftSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: leftVisibleDuration, retime }),
	});
	const totalSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: element.duration, retime }),
	});
	const rightSourceSpan = subMediaTime({
		a: totalSourceSpan,
		b: leftSourceSpan,
	});
	const { leftAnimations, rightAnimations } = splitAnimationsAtTime({
		animations: element.animations,
		splitTime: relativeTime,
		shouldIncludeSplitBoundary: true,
	});

	return [
		{
			...element,
			duration: leftVisibleDuration,
			trimEnd: addMediaTime({ a: element.trimEnd, b: rightSourceSpan }),
			animations: leftAnimations,
			...(retime !== undefined ? { retime } : {}),
		},
		{
			...element,
			id: generateUUID(),
			startTime: splitTime,
			duration: rightVisibleDuration,
			trimStart: addMediaTime({ a: element.trimStart, b: leftSourceSpan }),
			animations: rightAnimations,
			...(retime !== undefined ? { retime } : {}),
		},
	];
}

function removeRangeFromElement({
	element,
	range,
}: {
	element: TimelineElement;
	range: TimelineCutRange;
}): TimelineElement[] {
	const duration = subMediaTime({ a: range.endTime, b: range.startTime });
	const piecesAtEnd = splitElementAtTime({
		element,
		splitTime: range.endTime,
	});
	const pieces = piecesAtEnd.flatMap((piece) =>
		splitElementAtTime({ element: piece, splitTime: range.startTime }),
	);

	return pieces.flatMap((piece) => {
		const pieceEnd = addMediaTime({ a: piece.startTime, b: piece.duration });
		const isInsideRange =
			piece.startTime >= range.startTime && pieceEnd <= range.endTime;
		if (isInsideRange) return [];
		if (piece.startTime >= range.endTime) {
			return [
				{
					...piece,
					startTime: subMediaTime({ a: piece.startTime, b: duration }),
				},
			];
		}
		return [piece];
	});
}

function removeRangeFromTrack<TTrack extends TimelineTrack>({
	track,
	range,
}: {
	track: TTrack;
	range: TimelineCutRange;
}): TTrack {
	return {
		...track,
		elements: track.elements.flatMap((element) =>
			removeRangeFromElement({ element, range }),
		),
	} as TTrack;
}

export function normalizeTimelineCutRanges({
	ranges,
	totalDuration,
}: {
	ranges: TimelineCutRange[];
	totalDuration: MediaTime;
}): TimelineCutRange[] {
	const ordered = ranges
		.map((range) => ({
			startTime: mediaTime({
				ticks: Math.max(0, Math.min(totalDuration, range.startTime)),
			}),
			endTime: mediaTime({
				ticks: Math.max(0, Math.min(totalDuration, range.endTime)),
			}),
		}))
		.filter((range) => range.endTime > range.startTime)
		.sort((a, b) => a.startTime - b.startTime);

	const merged: TimelineCutRange[] = [];
	for (const range of ordered) {
		const previous = merged.at(-1);
		if (previous && range.startTime <= previous.endTime) {
			previous.endTime = mediaTime({
				ticks: Math.max(previous.endTime, range.endTime),
			});
			continue;
		}
		merged.push({ ...range });
	}
	return merged;
}

export function removeTimeRangesFromTracks({
	tracks,
	ranges,
	totalDuration,
}: {
	tracks: SceneTracks;
	ranges: TimelineCutRange[];
	totalDuration: MediaTime;
}): SceneTracks {
	const normalized = normalizeTimelineCutRanges({ ranges, totalDuration });
	return [...normalized].reverse().reduce<SceneTracks>((current, range) => {
		return {
			overlay: current.overlay.map((track) =>
				removeRangeFromTrack({ track, range }),
			),
			main: removeRangeFromTrack({ track: current.main, range }),
			audio: current.audio.map((track) =>
				removeRangeFromTrack({ track, range }),
			),
		};
	}, tracks);
}

