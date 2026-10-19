import { useEffect, useRef } from "react";

interface UseEdgeAutoScrollParams {
	isActive: boolean;
	getMouseClientX: () => number;
	onAutoScroll?: () => void;
	rulerScrollRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
	contentWidth: number;
	edgeThreshold?: number;
	maxScrollSpeed?: number;
}

export function useEdgeAutoScroll({
	isActive,
	getMouseClientX,
	onAutoScroll,
	rulerScrollRef,
	tracksScrollRef,
	contentWidth,
	edgeThreshold = 100,
	maxScrollSpeed = 15,
}: UseEdgeAutoScrollParams): void {
	const rafRef = useRef<number | null>(null);
	const getMouseClientXRef = useRef(getMouseClientX);
	const onAutoScrollRef = useRef(onAutoScroll);

	useEffect(() => {
		getMouseClientXRef.current = getMouseClientX;
		onAutoScrollRef.current = onAutoScroll;
	}, [getMouseClientX, onAutoScroll]);

	useEffect(() => {
		if (!isActive) {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			return;
		}

		let previousTimestamp: number | null = null;
		const step = (timestamp: number) => {
			const rulerViewport = rulerScrollRef.current;
			const tracksViewport = tracksScrollRef.current;
			if (!rulerViewport || !tracksViewport) {
				rafRef.current = requestAnimationFrame(step);
				return;
			}
			const frameFactor =
				previousTimestamp === null
					? 1
					: Math.min(3, (timestamp - previousTimestamp) / (1000 / 60));
			previousTimestamp = timestamp;

			const viewportRect = rulerViewport.getBoundingClientRect();
			const mouseX = getMouseClientXRef.current();
			const mouseXRelative = mouseX - viewportRect.left;

			const viewportWidth = rulerViewport.clientWidth;
			const intrinsicContentWidth = rulerViewport.scrollWidth;
			const effectiveContentWidth = Math.max(
				contentWidth,
				intrinsicContentWidth,
			);
			const scrollMax = Math.max(0, effectiveContentWidth - viewportWidth);

			let scrollSpeed = 0;

			if (mouseXRelative < edgeThreshold && rulerViewport.scrollLeft > 0) {
				const edgeDistance = Math.max(0, mouseXRelative);
				const intensity = 1 - edgeDistance / edgeThreshold;
				scrollSpeed = -maxScrollSpeed * intensity * frameFactor;
			} else if (
				mouseXRelative > viewportWidth - edgeThreshold &&
				rulerViewport.scrollLeft < scrollMax
			) {
				const edgeDistance = Math.max(0, viewportWidth - mouseXRelative);
				const intensity = 1 - edgeDistance / edgeThreshold;
				scrollSpeed = maxScrollSpeed * intensity * frameFactor;
			}

			if (scrollSpeed !== 0) {
				const newScrollLeft = Math.max(
					0,
					Math.min(scrollMax, rulerViewport.scrollLeft + scrollSpeed),
				);
				if (newScrollLeft !== rulerViewport.scrollLeft) {
					rulerViewport.scrollLeft = newScrollLeft;
					tracksViewport.scrollLeft = newScrollLeft;
					onAutoScrollRef.current?.();
				}
			}

			rafRef.current = requestAnimationFrame(step);
		};

		rafRef.current = requestAnimationFrame(step);

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [
		isActive,
		rulerScrollRef,
		tracksScrollRef,
		contentWidth,
		edgeThreshold,
		maxScrollSpeed,
	]);
}
