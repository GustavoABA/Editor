import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import {
	removeTimeRangesFromTracks,
	type TimelineCutRange,
} from "@/timeline/remove-time-ranges";
import type { MediaTime } from "@/wasm";

export class RemoveTimeRangesCommand extends Command {
	private before: SceneTracks | null = null;
	private after: SceneTracks | null = null;

	constructor({
		ranges,
		totalDuration,
	}: {
		ranges: TimelineCutRange[];
		totalDuration: MediaTime;
	}) {
		super();
		this.ranges = ranges;
		this.totalDuration = totalDuration;
	}

	private readonly ranges: TimelineCutRange[];
	private readonly totalDuration: MediaTime;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		if (!this.before || !this.after) {
			this.before = editor.scenes.getActiveScene().tracks;
			this.after = removeTimeRangesFromTracks({
				tracks: this.before,
				ranges: this.ranges,
				totalDuration: this.totalDuration,
			});
		}
		editor.timeline.updateTracks(this.after);
		return {
			selection: {
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		};
	}

	undo(): void {
		if (this.before) {
			EditorCore.getInstance().timeline.updateTracks(this.before);
		}
	}
}
