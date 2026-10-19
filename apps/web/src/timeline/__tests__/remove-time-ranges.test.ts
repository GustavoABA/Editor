import { describe, expect, mock, test } from "bun:test";
import type { SceneTracks, VideoElement } from "@/timeline";

mock.module("opencut-wasm", () => ({
	TICKS_PER_SECOND: () => 1_000_000,
	lastFrameTime: ({ duration }: { duration: number }) => duration,
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * 1_000_000),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 1_000_000,
	parseTimecode: () => undefined,
	roundToFrame: ({ time }: { time: number }) => time,
	snappedSeekTime: ({ time }: { time: number }) => time,
}));

const { removeTimeRangesFromTracks } =
	await import("@/timeline/remove-time-ranges");

function videoElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: "media-1",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		params: {},
	};
}

function tracks(elements: VideoElement[]): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main Track",
			type: "video",
			elements,
			muted: false,
			hidden: false,
		},
		audio: [],
	};
}

describe("removeTimeRangesFromTracks", () => {
	test("removes a middle range, preserves both source sides and closes the gap", () => {
		const result = removeTimeRangesFromTracks({
			tracks: tracks([
				videoElement({ id: "clip", startTime: 0, duration: 10 }),
			]),
			ranges: [{ startTime: 3, endTime: 5 }],
			totalDuration: 10,
		});

		expect(result.main.elements).toHaveLength(2);
		expect(result.main.elements[0]).toMatchObject({
			id: "clip",
			startTime: 0,
			duration: 3,
			trimEnd: 7,
		});
		expect(result.main.elements[1]).toMatchObject({
			startTime: 3,
			duration: 5,
			trimStart: 5,
		});
	});

	test("shifts later clips once for each removed range", () => {
		const result = removeTimeRangesFromTracks({
			tracks: tracks([
				videoElement({ id: "a", startTime: 0, duration: 2 }),
				videoElement({ id: "b", startTime: 4, duration: 2 }),
				videoElement({ id: "c", startTime: 8, duration: 2 }),
			]),
			ranges: [
				{ startTime: 2, endTime: 4 },
				{ startTime: 6, endTime: 8 },
			],
			totalDuration: 10,
		});

		expect(result.main.elements.map((element) => element.startTime)).toEqual([
			0, 2, 4,
		]);
	});
});
