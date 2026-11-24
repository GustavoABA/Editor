import { describe, expect, test } from "bun:test";
import { canReuseExternalTexture } from "./external-texture-cache";

describe("external video texture cache", () => {
	test("uploads a recycled decoder canvas when its presentation frame changes", () => {
		const recycledCanvas = {};
		const previous = {
			source: recycledCanvas,
			width: 1920,
			height: 1080,
			frameVersion: 1,
		};

		expect(
			canReuseExternalTexture({
				previous,
				next: { kind: "external", id: "video", ...previous, frameVersion: 2 },
			}),
		).toBe(false);
	});

	test("reuses an unchanged frame", () => {
		const source = {};
		const texture = {
			kind: "external" as const,
			id: "video",
			source,
			width: 640,
			height: 360,
			frameVersion: 2,
		};
		expect(canReuseExternalTexture({ previous: texture, next: texture })).toBe(true);
	});
});
