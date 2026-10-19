use serde::{Deserialize, Serialize};

const DEFAULT_WINDOW_MS: u32 = 20;
const MIN_AMPLITUDE: f32 = 1.0e-9;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoCutOptions {
    pub sample_rate: u32,
    pub threshold_db: f32,
    pub min_silence_ms: u32,
    pub padding_ms: u32,
    pub min_clip_ms: u32,
    #[serde(default = "default_window_ms")]
    pub window_ms: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start_seconds: f64,
    pub end_seconds: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoCutAnalysis {
    pub cut_ranges: Vec<TimeRange>,
    pub kept_ranges: Vec<TimeRange>,
    pub total_duration_seconds: f64,
    pub removed_duration_seconds: f64,
    pub detected_silence_count: usize,
}

fn default_window_ms() -> u32 {
    DEFAULT_WINDOW_MS
}

fn amplitude_to_db(amplitude: f32) -> f32 {
    20.0 * amplitude.max(MIN_AMPLITUDE).log10()
}

fn normalize_options(options: AutoCutOptions) -> AutoCutOptions {
    AutoCutOptions {
        sample_rate: options.sample_rate.max(1),
        threshold_db: options.threshold_db.clamp(-80.0, -6.0),
        min_silence_ms: options.min_silence_ms.clamp(80, 10_000),
        padding_ms: options.padding_ms.min(2_000),
        min_clip_ms: options.min_clip_ms.clamp(0, 10_000),
        window_ms: options.window_ms.clamp(5, 100),
    }
}

pub fn analyze_samples(samples: &[f32], options: AutoCutOptions) -> AutoCutAnalysis {
    let options = normalize_options(options);
    let total_duration_seconds = samples.len() as f64 / options.sample_rate as f64;
    if samples.is_empty() {
        return AutoCutAnalysis {
            cut_ranges: Vec::new(),
            kept_ranges: Vec::new(),
            total_duration_seconds,
            removed_duration_seconds: 0.0,
            detected_silence_count: 0,
        };
    }

    let window_samples = ((options.sample_rate as u64 * options.window_ms as u64) / 1_000)
        .max(1) as usize;
    let min_silence_seconds = options.min_silence_ms as f64 / 1_000.0;
    let padding_seconds = options.padding_ms as f64 / 1_000.0;
    let min_clip_seconds = options.min_clip_ms as f64 / 1_000.0;

    let silent_windows: Vec<bool> = samples
        .chunks(window_samples)
        .map(|window| {
            let mean_square = window
                .iter()
                .map(|sample| {
                    let sample = *sample as f64;
                    sample * sample
                })
                .sum::<f64>()
                / window.len().max(1) as f64;
            amplitude_to_db(mean_square.sqrt() as f32) < options.threshold_db
        })
        .collect();

    let mut detected_silence_count = 0usize;
    let mut candidate_ranges = Vec::new();
    let mut run_start: Option<usize> = None;

    for index in 0..=silent_windows.len() {
        let is_silent = silent_windows.get(index).copied().unwrap_or(false);
        match (run_start, is_silent) {
            (None, true) => run_start = Some(index),
            (Some(start), false) => {
                let raw_start = start as f64 * window_samples as f64
                    / options.sample_rate as f64;
                let raw_end = (index * window_samples).min(samples.len()) as f64
                    / options.sample_rate as f64;
                if raw_end - raw_start >= min_silence_seconds {
                    detected_silence_count += 1;
                    let touches_start = raw_start <= f64::EPSILON;
                    let touches_end = raw_end >= total_duration_seconds;
                    let cut_start = if touches_start {
                        0.0
                    } else {
                        raw_start + padding_seconds
                    };
                    let cut_end = if touches_end {
                        total_duration_seconds
                    } else {
                        raw_end - padding_seconds
                    };
                    if cut_end - cut_start > 0.01 {
                        candidate_ranges.push(TimeRange {
                            start_seconds: cut_start,
                            end_seconds: cut_end,
                        });
                    }
                }
                run_start = None;
            }
            _ => {}
        }
    }

    let mut cut_ranges: Vec<TimeRange> = Vec::new();
    for range in candidate_ranges {
        if let Some(previous) = cut_ranges.last_mut()
            && range.start_seconds - previous.end_seconds < min_clip_seconds
        {
            previous.end_seconds = range.end_seconds;
            continue;
        }
        cut_ranges.push(range);
    }

    let mut kept_ranges = Vec::new();
    let mut cursor = 0.0;
    for range in &cut_ranges {
        if range.start_seconds > cursor {
            kept_ranges.push(TimeRange {
                start_seconds: cursor,
                end_seconds: range.start_seconds,
            });
        }
        cursor = range.end_seconds;
    }
    if cursor < total_duration_seconds {
        kept_ranges.push(TimeRange {
            start_seconds: cursor,
            end_seconds: total_duration_seconds,
        });
    }

    let removed_duration_seconds = cut_ranges
        .iter()
        .map(|range| range.end_seconds - range.start_seconds)
        .sum();

    AutoCutAnalysis {
        cut_ranges,
        kept_ranges,
        total_duration_seconds,
        removed_duration_seconds,
        detected_silence_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> AutoCutOptions {
        AutoCutOptions {
            sample_rate: 1_000,
            threshold_db: -35.0,
            min_silence_ms: 400,
            padding_ms: 100,
            min_clip_ms: 100,
            window_ms: 20,
        }
    }

    #[test]
    fn removes_a_long_middle_silence_and_keeps_padding() {
        let mut samples = vec![0.5; 1_000];
        samples.extend(vec![0.0; 1_000]);
        samples.extend(vec![0.5; 1_000]);

        let result = analyze_samples(&samples, options());

        assert_eq!(result.detected_silence_count, 1);
        assert_eq!(result.cut_ranges.len(), 1);
        assert!((result.cut_ranges[0].start_seconds - 1.1).abs() < 0.03);
        assert!((result.cut_ranges[0].end_seconds - 1.9).abs() < 0.03);
    }

    #[test]
    fn ignores_silence_shorter_than_the_minimum() {
        let mut samples = vec![0.5; 1_000];
        samples.extend(vec![0.0; 200]);
        samples.extend(vec![0.5; 1_000]);

        let result = analyze_samples(&samples, options());

        assert!(result.cut_ranges.is_empty());
        assert_eq!(result.detected_silence_count, 0);
    }

    #[test]
    fn trims_leading_and_trailing_silence() {
        let mut samples = vec![0.0; 1_000];
        samples.extend(vec![0.5; 1_000]);
        samples.extend(vec![0.0; 1_000]);

        let result = analyze_samples(&samples, options());

        assert_eq!(result.cut_ranges.len(), 2);
        assert_eq!(result.cut_ranges[0].start_seconds, 0.0);
        assert!((result.cut_ranges[0].end_seconds - 0.9).abs() < 0.03);
        assert!((result.cut_ranges[1].start_seconds - 2.1).abs() < 0.03);
        assert!((result.cut_ranges[1].end_seconds - 3.0).abs() < 0.03);
    }
}

