import type { MouseEvent as ReactMouseEvent } from "react";
import type { FrameRate } from "opencut-wasm";
import {
	mediaTime,
	snapSeekMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import {
	buildTimelineSnapPoints,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
} from "@/timeline/snapping";
import { getBookmarkSnapPoints } from "@/timeline/bookmarks/index";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import {
	getCenteredLineLeft,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
} from "@/timeline";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import type { Bookmark, SceneTracks } from "@/timeline";

// --- Session ---

interface ScrubSession {
	kind: "scrubbing";
	/** True when scrub started from a ruler click (not the playhead handle). */
	didStartFromRuler: boolean;
	/** True once the mouse has moved during a ruler drag. */
	hasMoved: boolean;
	startClientX: number;
	pointerOffsetPx: number;
	/** Most recent frame-snapped time set by scrub(). */
	currentTime: MediaTime | null;
}

type Session = { kind: "idle" } | ScrubSession;

// --- Config ---

export interface PlayheadConfig {
	zoomLevel: number;
	duration: MediaTime;
	getActiveProjectFps: () => FrameRate | null;
	isShiftHeld: () => boolean;
	getIsPlaying: () => boolean;
	getCurrentTime: () => MediaTime;
	getRulerEl: () => HTMLDivElement | null;
	getRulerScrollEl: () => HTMLDivElement | null;
	getTracksScrollEl: () => HTMLDivElement | null;
	getPlayheadEl: () => HTMLDivElement | null;
	getSceneTracks: () => SceneTracks;
	getSceneBookmarks: () => Bookmark[];
	seek: (time: MediaTime) => void;
	setScrubbing: (isScrubbing: boolean) => void;
	setTimelineViewState: (viewState: {
		zoomLevel: number;
		scrollLeft: number;
		playheadTime: MediaTime;
	}) => void;
}

export interface PlayheadConfigRef {
	readonly current: PlayheadConfig;
}

// --- Pure helpers (px → logical) ---

function pixelToTime({
	clientX,
	rulerEl,
	zoomLevel,
	duration,
}: {
	clientX: number;
	rulerEl: HTMLDivElement;
	zoomLevel: number;
	duration: MediaTime;
}): MediaTime {
	const rulerRect = rulerEl.getBoundingClientRect();
	const contentWidth = timelineTimeToPixels({ time: duration, zoomLevel });
	const clampedX = Math.max(
		0,
		Math.min(contentWidth, clientX - rulerRect.left),
	);
	const seconds = Math.max(
		0,
		Math.min(
			duration / TICKS_PER_SECOND,
			clampedX / (BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel),
		),
	);
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

// --- Controller ---

export class PlayheadController {
	private lastMouseClientX = 0;

	private session: Session = { kind: "idle" };
	private readonly configRef: PlayheadConfigRef;

	constructor(deps: { configRef: PlayheadConfigRef }) {
		this.configRef = deps.configRef;
		this.onPlayheadMouseDown = this.onPlayheadMouseDown.bind(this);
		this.onRulerMouseDown = this.onRulerMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
		this.handleWindowBlur = this.handleWindowBlur.bind(this);
	}

	private get config(): PlayheadConfig {
		return this.configRef.current;
	}

	get isActive(): boolean {
		return this.session.kind !== "idle";
	}

	getLastMouseClientX(): number {
		return this.lastMouseClientX;
	}
	/** Auto-pan only after actual drag AND only when pointer leaves viewport. */
	canAutoScroll(): boolean {
		if (this.session.kind !== "scrubbing" || !this.session.hasMoved) return false;
		const bounds = this.config.getRulerScrollEl()?.getBoundingClientRect();
		return Boolean(bounds && (this.lastMouseClientX < bounds.left ||
			this.lastMouseClientX > bounds.right));
	}

	/** Re-resolves the scrub time after edge auto-scroll moves the viewport. */
	handleAutoScroll(): void {
		if (!this.canAutoScroll()) return;
		this.scrubAtClientX({
			clientX: this.lastMouseClientX,
			isElementSnappingEnabled: true,
		});
	}

	destroy(): void {
		if (this.session.kind === "scrubbing") {
			this.finishScrub();
		} else {
			this.deactivate();
		}
	}

	// --- Public event handlers (bound, stable references) ---

	onPlayheadMouseDown(event: ReactMouseEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = this.config.getPlayheadEl()?.getBoundingClientRect();
		// Keep the exact playback position when grabbing any part of the handle.
		// Without an offset, mousedown seeks to the mouse coordinate and visibly
		// snaps the head backwards after zooming.
		this.session = {
			kind: "scrubbing",
			didStartFromRuler: false,
			hasMoved: false,
			startClientX: event.clientX,
			pointerOffsetPx: rect ? event.clientX - (rect.left + rect.width / 2) : 0,
			currentTime: this.config.getCurrentTime(),
		};
		this.lastMouseClientX = event.clientX;
		this.config.setScrubbing(true);
		this.activate();
	}

	onRulerMouseDown(event: ReactMouseEvent): void {
		if (event.button !== 0) return;
		if (
			event.target instanceof Node &&
			this.config.getPlayheadEl()?.contains(event.target)
		) {
			return;
		}

		event.preventDefault();
		this.session = {
			kind: "scrubbing",
			didStartFromRuler: true,
			hasMoved: false,
			startClientX: event.clientX,
			pointerOffsetPx: 0,
			currentTime: null,
		};
		this.config.setScrubbing(true);
		// No element-edge snapping on initial ruler click — avoids a jarring jump.
		this.scrubAtClientX({
			clientX: event.clientX,
			isElementSnappingEnabled: false,
		});
		this.activate();
	}

	// --- Public non-session methods ---

	/**
	 * Imperatively updates the playhead DOM element's `left` style.
	 * Called on scroll and playback events to avoid React re-renders
	 * during animation frame updates.
	 */
	updatePlayheadLeft(time: MediaTime): void {
		const playheadEl = this.config.getPlayheadEl();
		if (!playheadEl) return;

		const centerPixel = timelineTimeToSnappedPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const scrollLeft = this.config.getRulerScrollEl()?.scrollLeft ?? 0;
		playheadEl.style.left = `${getCenteredLineLeft({ centerPixel }) - scrollLeft}px`;
	}

	/**
	 * Updates the playhead position and auto-scrolls to keep the playhead
	 * visible during playback.
	 */
	handlePlaybackUpdate(time: MediaTime): void {
		this.updatePlayheadLeft(time);

		// Auto-scroll only during playback, not while scrubbing.
		if (!this.config.getIsPlaying() || this.session.kind === "scrubbing")
			return;

		const rulerViewport = this.config.getRulerScrollEl();
		const tracksViewport = this.config.getTracksScrollEl();
		if (!rulerViewport || !tracksViewport) return;

		const playheadPixels = timelineTimeToPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const viewportWidth = rulerViewport.clientWidth;
		const isOutOfView =
			playheadPixels < rulerViewport.scrollLeft ||
			playheadPixels > rulerViewport.scrollLeft + viewportWidth;

		if (isOutOfView) {
			const desiredScroll = Math.max(
				0,
				Math.min(
					rulerViewport.scrollWidth - viewportWidth,
					playheadPixels - viewportWidth / 2,
				),
			);
			rulerViewport.scrollLeft = tracksViewport.scrollLeft = desiredScroll;
		}
	}

	// --- Private ---

	private activate(): void {
		window.addEventListener("mousemove", this.handleMouseMove);
		window.addEventListener("mouseup", this.handleMouseUp);
		window.addEventListener("blur", this.handleWindowBlur);
	}

	private deactivate(): void {
		window.removeEventListener("mousemove", this.handleMouseMove);
		window.removeEventListener("mouseup", this.handleMouseUp);
		window.removeEventListener("blur", this.handleWindowBlur);
	}

	/**
	 * Converts pointer position to a frame-snapped timeline time and seeks.
	 * `isElementSnappingEnabled` controls element-edge snapping; frame-level snapping
	 * is always applied.
	 */
	private scrubAtClientX({
		clientX,
		isElementSnappingEnabled,
	}: {
		clientX: number;
		isElementSnappingEnabled: boolean;
	}): void {
		const ruler = this.config.getRulerEl();
		if (!ruler) return;

		const fps = this.config.getActiveProjectFps();
		if (!fps) return;

		const { zoomLevel, duration } = this.config;
		const effectiveClientX = this.session.kind === "scrubbing"
			? clientX - this.session.pointerOffsetPx : clientX;
		const rawTime = pixelToTime({
			clientX: effectiveClientX,
			rulerEl: ruler,
			zoomLevel,
			duration,
		});
		const frameTime = snapSeekMediaTime({ time: rawTime, duration, fps });

		const time = (() => {
			if (!isElementSnappingEnabled || this.config.isShiftHeld())
				return frameTime;

			const snapPoints = buildTimelineSnapPoints({
				sources: [
					() =>
						getElementEdgeSnapPoints({ tracks: this.config.getSceneTracks() }),
					() =>
						getBookmarkSnapPoints({
							bookmarks: this.config.getSceneBookmarks(),
						}),
					() =>
						getAnimationKeyframeSnapPointsForTimeline({
							tracks: this.config.getSceneTracks(),
						}),
				],
			});
			const result = resolveTimelineSnap({
				targetTime: frameTime,
				snapPoints,
				maxSnapDistance: getTimelineSnapThresholdInTicks({ zoomLevel }),
			});
			return result.snapPoint ? result.snappedTime : frameTime;
		})();

		if (this.session.kind === "scrubbing") {
			this.session.currentTime = time;
		}
		this.config.seek(time);
		this.lastMouseClientX = clientX;
	}

	private handleMouseMove(event: MouseEvent): void {
		if (this.session.kind !== "scrubbing") return;
		if (Math.abs(event.clientX - this.session.startClientX) < 3 &&
			!this.session.hasMoved) return;
		this.session.hasMoved = true;
		this.scrubAtClientX({
			clientX: event.clientX,
			isElementSnappingEnabled: true,
		});
	}

	private handleMouseUp(event: MouseEvent): void {
		if (this.session.kind !== "scrubbing") return;
		this.finishScrub({ clientX: event.clientX });
	}

	private handleWindowBlur(): void {
		if (this.session.kind !== "scrubbing") return;
		this.finishScrub();
	}

	private finishScrub({ clientX }: { clientX?: number } = {}): void {
		if (this.session.kind !== "scrubbing") return;

		const session = this.session;

		// A ruler click without a move should resolve from the release position.
		// Do this before leaving the session so scrubAtClientX records the result.
		if (
			clientX !== undefined &&
			session.didStartFromRuler &&
			!session.hasMoved
		) {
			this.scrubAtClientX({
				clientX,
				isElementSnappingEnabled: false,
			});
		}

		const finalTime = session.currentTime;
		this.session = { kind: "idle" };
		this.deactivate();
		this.config.setScrubbing(false);

		if (finalTime !== null) {
			this.config.seek(finalTime);
			this.config.setTimelineViewState({
				zoomLevel: this.config.zoomLevel,
				scrollLeft: this.config.getTracksScrollEl()?.scrollLeft ?? 0,
				playheadTime: finalTime,
			});
		}
	}
}
