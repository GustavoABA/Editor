type Beat = { seconds: number; energy: number };

/** Produce deterministic edit points from audio, without executing generated JavaScript. */
export function findAudioPeaks(samples: Float32Array, sampleRate: number, maxBeats = 16): Beat[] {
  if (!(sampleRate > 0)) return [];
  const frameSamples = Math.max(1, Math.floor(sampleRate * 0.15));
  const frames: Beat[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSamples) {
    let total = 0;
    const count = Math.min(frameSamples, samples.length - offset);
    for (let i = 0; i < count; i++) total += samples[offset + i] ** 2;
    frames.push({ seconds: offset / sampleRate, energy: Math.sqrt(total / count) });
  }
  if (!frames.length) return [];
  const sorted = frames.map(f => f.energy).sort((a, b) => a - b);
  const threshold = Math.max(0.08, sorted[Math.floor(sorted.length * 0.8)] * 1.2);
  const peaks: Beat[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    if (frames[i].energy < threshold || frames[i].energy < frames[i - 1].energy ||
        frames[i].energy <= frames[i + 1].energy) continue;
    if (peaks.length && frames[i].seconds - peaks[peaks.length - 1].seconds < 0.5) continue;
    peaks.push(frames[i]);
    if (peaks.length >= maxBeats) break;
  }
  return peaks;
}

