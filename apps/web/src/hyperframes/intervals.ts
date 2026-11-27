/** Zero means the remaining original timeline. Split long work into bounded CLI jobs. */
export function planHyperFramesIntervals(start: number, requested: number, timelineEnd: number) {
  if (![start, requested, timelineEnd].every(Number.isFinite) || start < 0 || requested < 0 || timelineEnd <= start) return [];
  const end = Math.min(timelineEnd, requested === 0 ? timelineEnd : start + requested);
  if (end - start < 0.3) return [];
  const count = Math.ceil((end - start) / 12);
  // Equal subdivisions avoid a final fragment shorter than the renderer minimum.
  const size = (end - start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: start + index * size, duration: size }));
}
export function formatTimelineDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return Math.floor(total / 60) + "m " + String(total % 60).padStart(2, "0") + "s";
}
