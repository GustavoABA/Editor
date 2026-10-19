import type {
	FrameDescriptor,
	QuadTransformDescriptor,
	TextureUploadDescriptor,
} from "./types";

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class CpuCompositor {
	private textures = new Map<string, CanvasImageSource>();

	render({
		canvas,
		frame,
		textures,
	}: {
		canvas: HTMLCanvasElement;
		frame: FrameDescriptor;
		textures: TextureUploadDescriptor[];
	}) {
		if (canvas.width !== frame.width) canvas.width = frame.width;
		if (canvas.height !== frame.height) canvas.height = frame.height;
		this.syncTextures(textures);

		const context = canvas.getContext("2d");
		if (!context) throw new Error("CPU compositor could not create a 2D context");
		const [red, green, blue, alpha] = frame.clear.color;
		context.save();
		context.globalCompositeOperation = "source-over";
		context.globalAlpha = 1;
		context.fillStyle = `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
		context.fillRect(0, 0, frame.width, frame.height);
		context.restore();

		for (const item of frame.items) {
			if (item.type === "sceneEffect") continue;
			const source = this.textures.get(item.textureId);
			if (!source) continue;

			const layer = new OffscreenCanvas(frame.width, frame.height);
			const layerContext = layer.getContext("2d");
			if (!layerContext) continue;
			drawTransformed({ context: layerContext, source, transform: item.transform });

			if (item.mask) {
				const mask = this.textures.get(item.mask.textureId);
				if (mask) {
					layerContext.globalCompositeOperation = item.mask.inverted
						? "destination-out"
						: "destination-in";
					layerContext.drawImage(mask, 0, 0, frame.width, frame.height);
					layerContext.globalCompositeOperation = "source-over";
				}
			}

			context.save();
			context.globalAlpha = Math.max(0, Math.min(1, item.opacity));
			context.globalCompositeOperation = item.blendMode === "normal"
				? "source-over"
				: item.blendMode === "plus-lighter"
					? "lighter"
					: item.blendMode;
			context.drawImage(layer, 0, 0);
			context.restore();
		}
	}

	private syncTextures(textures: TextureUploadDescriptor[]) {
		const activeIds = new Set(textures.map((texture) => texture.id));
		for (const id of this.textures.keys()) {
			if (!activeIds.has(id)) this.textures.delete(id);
		}

		for (const texture of textures) {
			if (texture.kind === "external") {
				this.textures.set(texture.id, texture.source);
				continue;
			}
			const surface = new OffscreenCanvas(texture.width, texture.height);
			const context = surface.getContext("2d");
			if (!context) continue;
			texture.draw(context);
			this.textures.set(texture.id, surface);
		}
	}
}

function drawTransformed({
	context,
	source,
	transform,
}: {
	context: Canvas2D;
	source: CanvasImageSource;
	transform: QuadTransformDescriptor;
}) {
	context.save();
	context.translate(transform.centerX, transform.centerY);
	context.rotate((transform.rotationDegrees * Math.PI) / 180);
	context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
	context.drawImage(
		source,
		-transform.width / 2,
		-transform.height / 2,
		transform.width,
		transform.height,
	);
	context.restore();
}
