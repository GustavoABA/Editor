use std::env;
use std::io::{self, Read};

use autocut::{AutoCutOptions, analyze_samples};

fn parse_arg<T: std::str::FromStr>(name: &str) -> Result<T, String> {
    let args: Vec<String> = env::args().collect();
    let index = args
        .iter()
        .position(|arg| arg == name)
        .ok_or_else(|| format!("Missing argument {name}"))?;
    args.get(index + 1)
        .ok_or_else(|| format!("Missing value for {name}"))?
        .parse::<T>()
        .map_err(|_| format!("Invalid value for {name}"))
}

fn run() -> Result<(), String> {
    let options = AutoCutOptions {
        sample_rate: parse_arg("--sample-rate")?,
        threshold_db: parse_arg("--threshold-db")?,
        min_silence_ms: parse_arg("--min-silence-ms")?,
        padding_ms: parse_arg("--padding-ms")?,
        min_clip_ms: parse_arg("--min-clip-ms")?,
        window_ms: parse_arg("--window-ms").unwrap_or(20),
    };

    let mut bytes = Vec::new();
    io::stdin()
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read PCM input: {error}"))?;
    if bytes.len() % 4 != 0 {
        return Err("PCM input must contain little-endian f32 samples".to_string());
    }

    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    let result = analyze_samples(&samples, options);
    let json = serde_json::to_string(&result)
        .map_err(|error| format!("Could not encode analysis: {error}"))?;
    println!("{json}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

