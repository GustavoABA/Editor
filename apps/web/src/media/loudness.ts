export interface LoudnessMeasurement {
  inputI: number;
  inputTp: number;
  inputLra: number;
}

/** Determine a non-destructive gain that never intentionally exceeds the measured true-peak ceiling. */
export function planLoudnessGain(args: {
  measurement: LoudnessMeasurement;
  targetLufs: number;
  maxTruePeakDb: number;
}): { gainDb: number; expectedLufs: number; limitedByPeak: boolean } {
  const { measurement, targetLufs, maxTruePeakDb } = args;
  if (!Number.isFinite(measurement.inputI) || !Number.isFinite(measurement.inputTp)) {
    throw new Error("O áudio está em silêncio ou não pode ser medido em LUFS.");
  }
  if (!Number.isFinite(targetLufs) || targetLufs < -30 || targetLufs > -8 ||
      !Number.isFinite(maxTruePeakDb) || maxTruePeakDb < -9 || maxTruePeakDb > -0.1) {
    throw new Error("Loudness target or true-peak limit is out of range");
  }
  const desiredGain = targetLufs - measurement.inputI;
  const peakGain = maxTruePeakDb - measurement.inputTp;
  const gainDb = Math.max(-48, Math.min(24, desiredGain, peakGain));
  return {
    gainDb: Math.round(gainDb * 100) / 100,
    expectedLufs: Math.round((measurement.inputI + gainDb) * 100) / 100,
    limitedByPeak: gainDb < desiredGain - 0.005,
  };
}

export function parseLoudnormStats(stderr: string): LoudnessMeasurement {
  const blocks = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!blocks?.length) throw new Error("FFmpeg did not return EBU R128 statistics");
  const value: unknown = JSON.parse(blocks.at(-1)!) as unknown;
  if (!value || typeof value !== "object") throw new Error("Invalid EBU R128 statistics");
  const data = value as Record<string, unknown>;
  const inputI = Number(data.input_i);
  const inputTp = Number(data.input_tp);
  const inputLra = Number(data.input_lra);
  if (!Number.isFinite(inputI) || !Number.isFinite(inputTp)) {
    throw new Error("Arquivo sem sinal de áudio mensurável");
  }
  return { inputI, inputTp, inputLra: Number.isFinite(inputLra) ? inputLra : 0 };
}
