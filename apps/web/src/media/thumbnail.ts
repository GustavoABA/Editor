const THUMBNAIL_MAX_WIDTH = 1280;
const THUMBNAIL_MAX_HEIGHT = 720;

export function thumbnailSize({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const aspectRatio = width / height;
	let targetWidth = width;
	let targetHeight = height;

	if (targetWidth > THUMBNAIL_MAX_WIDTH) {
		targetWidth = THUMBNAIL_MAX_WIDTH;
		targetHeight = Math.round(targetWidth / aspectRatio);
	}
	if (targetHeight > THUMBNAIL_MAX_HEIGHT) {
		targetHeight = THUMBNAIL_MAX_HEIGHT;
		targetWidth = Math.round(targetHeight * aspectRatio);
	}

	return { width: targetWidth, height: targetHeight };
}

export function renderThumbnailDataUrl({
	width,
	height,
	draw,
}: {
	width: number;
	height: number;
	draw: ({
		context,
		width,
		height,
	}: {
		context: CanvasRenderingContext2D;
		width: number;
		height: number;
	}) => void;
}): string {
	const size = thumbnailSize({ width, height });
	const canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("Could not get canvas context");
	}

	draw({ context, width: size.width, height: size.height });
	return canvas.toDataURL("image/jpeg", 0.8);
}

/** Browser fallback for codecs supported by HTMLVideoElement, even without WebCodecs. */
export function firstVideoFrame({ file }: { file: File }): Promise<string | undefined> {
	return new Promise((resolve) => {
		const video = document.createElement("video");
		const url = URL.createObjectURL(file);
		let settled = false;
		const finish = (value?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.onloadeddata = null;
			video.onerror = null;
			video.removeAttribute("src");
			video.load();
			URL.revokeObjectURL(url);
			resolve(value);
		};
		const timer = setTimeout(() => finish(), 10000);
		video.muted = true;
		video.playsInline = true;
		video.preload = "auto";
		video.onloadeddata = () => {
			try {
				if (!video.videoWidth || !video.videoHeight) return finish();
				finish(renderThumbnailDataUrl({
					width: video.videoWidth,
					height: video.videoHeight,
					draw: ({ context, width, height }) => context.drawImage(video, 0, 0, width, height),
				}));
			} catch { finish(); }
		};
		video.onerror = () => finish();
		video.src = url;
		video.load();
	});
}

const pendingThumbnails = new WeakMap<File, Promise<string | undefined>>();
let thumbnailQueue: Promise<unknown> = Promise.resolve();

/** Avoid repeatedly decoding the same file and cap concurrent native decoders. */
export function recoverVideoThumbnail({ file }: { file: File }): Promise<string | undefined> {
	const cached = pendingThumbnails.get(file);
	if (cached) return cached;
	const pending = thumbnailQueue.then(() => firstVideoFrame({ file }));
	thumbnailQueue = pending.catch(() => undefined);
	pendingThumbnails.set(file, pending);
	return pending;
}
