"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	BoxSelectionSnapshot,
	ResolveIntersections,
	SelectionBoxBounds,
} from "@/selection/types";

interface SelectionBoxState<TId> extends BoxSelectionSnapshot<TId> {
	startPos: { x: number; y: number };
	currentPos: { x: number; y: number };
	bounds: SelectionBoxBounds | null;
	isActive: boolean;
	isAdditive: boolean;
}

function getSelectionBoxBounds({
	container,
	startPos,
	currentPos,
}: {
	container: HTMLElement;
	startPos: { x: number; y: number };
	currentPos: { x: number; y: number };
}): SelectionBoxBounds {
	const containerRect = container.getBoundingClientRect();
	const startX = startPos.x - containerRect.left;
	const startY = startPos.y - containerRect.top;
	const currentX = currentPos.x - containerRect.left;
	const currentY = currentPos.y - containerRect.top;

	return {
		left: Math.min(startX, currentX),
		top: Math.min(startY, currentY),
		width: Math.abs(currentX - startX),
		height: Math.abs(currentY - startY),
	};
}

export function useBoxSelect<TId>({
	containerRef,
	resolveIntersections,
	selectedIds,
	anchorId,
	onSelectionChange,
	shouldStartSelection,
	getIsAdditiveSelection,
	isEnabled = true,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
	resolveIntersections: ResolveIntersections<TId>;
	selectedIds: TId[];
	anchorId: TId | null;
	onSelectionChange: (state: {
		intersectedIds: TId[];
		initialSelectedIds: TId[];
		initialAnchorId: TId | null;
		isAdditive: boolean;
	}) => void;
	shouldStartSelection?: (event: React.MouseEvent<Element>) => boolean;
	getIsAdditiveSelection?: (event: React.MouseEvent<Element>) => boolean;
	isEnabled?: boolean;
}) {
	const [selectionBox, setSelectionBox] =
		useState<SelectionBoxState<TId> | null>(null);
	const selectionBoxRef = useRef<SelectionBoxState<TId> | null>(null);
	const justFinishedSelectingRef = useRef(false);

	const handleMouseDown = useCallback(
		(event: React.MouseEvent<Element>) => {
			const canStartSelection = shouldStartSelection
				? shouldStartSelection(event)
				: true;
			if (!isEnabled || event.button !== 0 || !canStartSelection) {
				return;
			}

			const startPos = { x: event.clientX, y: event.clientY };
			const container = containerRef.current;
			const nextSelectionBox = {
				startPos,
				currentPos: startPos,
				bounds: container
					? getSelectionBoxBounds({
							container,
							startPos,
							currentPos: startPos,
						})
					: null,
				isActive: false,
				isAdditive: getIsAdditiveSelection
					? getIsAdditiveSelection(event)
					: event.ctrlKey || event.metaKey,
				initialSelectedIds: selectedIds,
				initialAnchorId: anchorId,
			};
			selectionBoxRef.current = nextSelectionBox;
			setSelectionBox(nextSelectionBox);
		},
		[
			anchorId,
			containerRef,
			getIsAdditiveSelection,
			isEnabled,
			selectedIds,
			shouldStartSelection,
		],
	);

	const updateSelection = useCallback(
		({
			startPos,
			currentPos,
			isAdditive,
			initialSelectedIds,
			initialAnchorId,
		}: SelectionBoxState<TId>) => {
			const intersectedIds = resolveIntersections({
				startPos,
				currentPos,
			});
			onSelectionChange({
				intersectedIds,
				initialSelectedIds,
				initialAnchorId,
				isAdditive,
			});
		},
		[onSelectionChange, resolveIntersections],
	);
	const updateSelectionRef = useRef(updateSelection);
	useEffect(() => {
		updateSelectionRef.current = updateSelection;
	}, [updateSelection]);

	const hasSelectionSession = selectionBox !== null;

	useEffect(() => {
		if (!hasSelectionSession) {
			return;
		}

		const handleMouseMove = ({ clientX, clientY }: MouseEvent) => {
			const currentSelectionBox = selectionBoxRef.current;
			if (!currentSelectionBox) return;

			const currentPos = { x: clientX, y: clientY };
			const deltaX = Math.abs(clientX - currentSelectionBox.startPos.x);
			const deltaY = Math.abs(clientY - currentSelectionBox.startPos.y);
			const container = containerRef.current;
			const nextSelectionBox = {
				...currentSelectionBox,
				currentPos,
				bounds: container
					? getSelectionBoxBounds({
							container,
							startPos: currentSelectionBox.startPos,
							currentPos,
						})
					: null,
				isActive: deltaX > 5 || deltaY > 5 || currentSelectionBox.isActive,
			};

			selectionBoxRef.current = nextSelectionBox;
			setSelectionBox(nextSelectionBox);

			if (!nextSelectionBox.isActive) {
				return;
			}

			updateSelectionRef.current(nextSelectionBox);
		};

		const handleMouseUp = () => {
			if (selectionBoxRef.current?.isActive) {
				justFinishedSelectingRef.current = true;
				requestAnimationFrame(() => {
					justFinishedSelectingRef.current = false;
				});
			}

			selectionBoxRef.current = null;
			setSelectionBox(null);
		};
		const handleWindowBlur = () => {
			selectionBoxRef.current = null;
			setSelectionBox(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("blur", handleWindowBlur);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [containerRef, hasSelectionSession]);

	useEffect(() => {
		if (!hasSelectionSession) {
			return;
		}

		const container = containerRef.current;
		const previousBodyUserSelect = document.body.style.userSelect;
		const previousContainerUserSelect = container?.style.userSelect ?? "";

		document.body.style.userSelect = "none";
		if (container) {
			container.style.userSelect = "none";
		}

		return () => {
			document.body.style.userSelect = previousBodyUserSelect;
			if (container) {
				container.style.userSelect = previousContainerUserSelect;
			}
		};
	}, [containerRef, hasSelectionSession]);

	const shouldIgnoreClick = useCallback(() => {
		return justFinishedSelectingRef.current;
	}, []);

	return {
		selectionBox:
			selectionBox?.isActive && selectionBox.bounds
				? { bounds: selectionBox.bounds }
				: null,
		handleMouseDown,
		isSelecting: selectionBox?.isActive ?? false,
		shouldIgnoreClick,
	};
}
