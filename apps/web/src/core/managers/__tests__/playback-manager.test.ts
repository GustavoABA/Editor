import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("opencut-wasm", () => ({
	TICKS_PER_SECOND: () => 120_000,
	lastFrameTime: ({ duration }: { duration: number }) => duration,
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * 120_000),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 120_000,
	parseTimecode: () => undefined,
	roundToFrame: ({ time }: { time: number }) => time,
	snappedSeekTime: ({ time }: { time: number }) => time,
}));

const [{ PlaybackManager }, { mediaTime }] = await Promise.all([
	import("@/core/managers/playback-manager"),
	import("@/wasm"),
]);

describe("PlaybackManager scrubbing", () => {
	const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
	const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
	let nextAnimationFrameId = 1;
	let scheduledAnimationFrames: Set<number>;

	beforeEach(() => {
		nextAnimationFrameId = 1;
		scheduledAnimationFrames = new Set();
		globalThis.requestAnimationFrame = () => {
			const id = nextAnimationFrameId++;
			scheduledAnimationFrames.add(id);
			return id;
		};
		globalThis.cancelAnimationFrame = (id) => {
			scheduledAnimationFrames.delete(id);
		};
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = originalRequestAnimationFrame;
		globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
	});

	test("freezes the playback clock while scrubbing and resumes afterward", () => {
		const duration = mediaTime({ ticks: 600_000 });
		const editor = {
			timeline: {
				getTotalDuration: () => duration,
				subscribe: () => () => {},
			},
			scenes: {
				subscribe: () => () => {},
			},
			project: {
				getActive: () => ({ settings: { fps: undefined } }),
			},
		};
		const playback = new PlaybackManager(editor);

		playback.play();
		expect(playback.getIsPlaying()).toBe(true);
		expect(scheduledAnimationFrames.size).toBe(1);

		playback.setScrubbing({ isScrubbing: true });
		expect(playback.getIsScrubbing()).toBe(true);
		expect(scheduledAnimationFrames.size).toBe(0);

		const scrubbedTime = mediaTime({ ticks: 240_000 });
		playback.seek({ time: scrubbedTime });
		expect(playback.getCurrentTime()).toBe(scrubbedTime);
		expect(scheduledAnimationFrames.size).toBe(0);

		playback.setScrubbing({ isScrubbing: false });
		expect(playback.getIsPlaying()).toBe(true);
		expect(scheduledAnimationFrames.size).toBe(1);

		playback.pause();
		expect(scheduledAnimationFrames.size).toBe(0);
	});

	test("does not restart the timer for duplicate scrubbing state", () => {
		const editor = {
			timeline: {
				getTotalDuration: () => mediaTime({ ticks: 600_000 }),
				subscribe: () => () => {},
			},
			scenes: {
				subscribe: () => () => {},
			},
			project: {
				getActive: () => ({ settings: { fps: undefined } }),
			},
		};
		const playback = new PlaybackManager(editor);

		playback.play();
		playback.setScrubbing({ isScrubbing: true });
		playback.setScrubbing({ isScrubbing: true });
		expect(scheduledAnimationFrames.size).toBe(0);

		playback.setScrubbing({ isScrubbing: false });
		const scheduledAfterResume = scheduledAnimationFrames.size;
		playback.setScrubbing({ isScrubbing: false });
		expect(scheduledAnimationFrames.size).toBe(scheduledAfterResume);
	});
});
