export type TimestampedFrame = {
	timestamp: number;
};

/**
 * Presentation must never advance to a decoded frame that belongs after the
 * requested playhead time. This matters for VFR/B-frame video where there can
 * be a gap between adjacent presentation timestamps.
 */
export function isFrameAtOrBeforeTime({
	frame,
	time,
}: {
	frame: TimestampedFrame;
	time: number;
}): boolean {
	return frame.timestamp <= time + 0.000001;
}
