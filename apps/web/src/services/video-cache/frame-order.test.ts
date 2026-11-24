import { describe, expect, test } from "bun:test";
import { isFrameAtOrBeforeTime } from "./frame-order";

describe("video frame presentation order", () => {
	test("does not promote a prefetched frame before its timestamp", () => {
		expect(
			isFrameAtOrBeforeTime({ frame: { timestamp: 12.04 }, time: 12 }),
		).toBe(false);
	});

	test("accepts the frame at the current presentation timestamp", () => {
		expect(
			isFrameAtOrBeforeTime({ frame: { timestamp: 12 }, time: 12 }),
		).toBe(true);
	});
});
