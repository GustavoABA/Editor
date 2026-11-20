import { spawn } from "node:child_process";
import { authorizeSync, assetFilePath, getAssetRecord, isRecord } from "@/lan-sync/server";
import { parseLoudnormStats, planLoudnessGain } from "@/media/loudness";

export const runtime = "nodejs";
const TIMEOUT = 2 * 60 * 1000;

function analyzeOnHost(file: string, targetLufs: number, maxTruePeakDb: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-nostdin", "-i", file, "-map", "0:a:0", "-vn",
      "-af", `loudnorm=I=${targetLufs}:TP=${maxTruePeakDb}:LRA=11:print_format=json`,
      "-f", "null", "-",
    ];
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let output = "";
    let finished = false;
    const kill = setTimeout(() => child.kill("SIGKILL"), TIMEOUT);
    child.stderr.on("data", (data: Buffer) => {
      if (output.length < 32_768) output += data.toString("utf8").slice(0, 32_768 - output.length);
    });
    child.once("error", (error) => {
      if (finished) return;
      finished = true; clearTimeout(kill); reject(error);
    });
    child.once("close", (code) => {
      if (finished) return;
      finished = true; clearTimeout(kill);
      if (code === 0) resolve(output);
      else reject(new Error("FFmpeg loudness scan failed (exit " + code + ")"));
    });
  });
}

/** Analyze a verified original on host; return a proposed gain, never rewrite the source. */
export async function POST(request: Request): Promise<Response> {
  const denied = authorizeSync(request);
  if (denied) return denied;
  const raw: unknown = await request.json().catch(() => null);
  if (!isRecord(raw) || typeof raw.projectId !== "string" || typeof raw.assetId !== "string" ||
      typeof raw.targetLufs !== "number" || typeof raw.maxTruePeakDb !== "number") {
    return Response.json({ error: "Invalid loudness analysis request" }, { status: 400 });
  }
  const { projectId, assetId, targetLufs, maxTruePeakDb } = raw;
  if (targetLufs < -30 || targetLufs > -8 || maxTruePeakDb < -9 || maxTruePeakDb > -0.1) {
    return Response.json({ error: "Invalid loudness target" }, { status: 400 });
  }
  try {
    const asset = await getAssetRecord(projectId, assetId);
    if (!asset || !["audio", "video"].includes(asset.type)) {
      return Response.json({ error: "A verified audio/video original must be uploaded before scanning" }, { status: 404 });
    }
    const stderr = await analyzeOnHost(assetFilePath(projectId, assetId), targetLufs, maxTruePeakDb);
    const measurement = parseLoudnormStats(stderr);
    return Response.json({ measurement, ...planLoudnessGain({ measurement, targetLufs, maxTruePeakDb }) });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Could not measure audio",
    }, { status: 422 });
  }
}
