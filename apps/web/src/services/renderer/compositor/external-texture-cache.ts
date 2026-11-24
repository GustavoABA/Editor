export type CachedExternalTexture = {
	source: unknown;
	width: number;
	height: number;
	frameVersion?: number;
};

/**
 * A decoded video canvas may be recycled by the decoder. Its pixels can thus
 * change while its object identity does not; frameVersion prevents the GPU
 * cache from displaying the first frame indefinitely after an effect is added.
 */
export function canReuseExternalTexture({
	previous,
	next,
}: {
	previous: CachedExternalTexture | undefined;
	next: CachedExternalTexture;
}): boolean {
	return Boolean(
		previous &&
		previous.source === next.source &&
		previous.width === next.width &&
		previous.height === next.height &&
		previous.frameVersion === next.frameVersion,
	);
}
