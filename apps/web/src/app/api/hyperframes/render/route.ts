import { authorizeSync } from "@/lan-sync/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const execute = promisify(execFile);
const NATIVE_RENDERER = "/opt/opencut-hyperframes/server.mjs";
const NATIVE_CLI = "/opt/opencut-hyperframes/node_modules/.bin/hyperframes";
const MAX_JSON = 96_000;
const MAX_VIDEO = 55 * 1024 * 1024;
let rendering = false;

async function installed(): Promise<boolean> {
  try {
    await Promise.all([access(NATIVE_RENDERER), access(NATIVE_CLI)]);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  return Response.json({
    available: await installed(), busy: rendering,
    integrated: true, service: "web", engine: "official-hyperframes-cli",
    format: "webm", needsSeparateContainer: false,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  if (!(await installed())) {
    return Response.json({ error: "HyperFrames não instalado no contêiner web. Reconstrua a imagem do Editor." },
      { status: 503 });
  }
  if (rendering) return Response.json({ error: "Renderização HyperFrames já em execução." }, { status: 429 });

  const len = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(len) || len < 1 || len > MAX_JSON) {
    return Response.json({ error: "Composição precisa ter entre 1 byte e 96 KB." }, { status: 413 });
  }
  rendering = true;
  let directory: string | null = null;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_JSON) {
      return Response.json({ error: "Composição acima de 96 KB." }, { status: 413 });
    }
    // One-shot subprocess, not an HTTP worker. Generate random private file
    // paths; never pass caller-controlled paths to the CLI or shell.
    directory = await mkdtemp(join(tmpdir(), "opencut-hf-request-"));
    const input = join(directory, "input.json");
    const output = join(directory, "overlay.webm");
    await writeFile(input, raw, { mode: 0o600 });
    await execute("node", [NATIVE_RENDERER, input, output], {
      timeout: 220_000,
      maxBuffer: 150_000,
      // Child process must not inherit app, database, LAN or AI credentials.
      env: {
        PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        XDG_CACHE_HOME: "/tmp/.cache",
        XDG_CONFIG_HOME: "/tmp/.config",
        CHROME_BIN: "/usr/bin/chromium-browser",
        PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium-browser",
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        NO_PROXY: "*",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
      },
    });
    const bytes = await readFile(output);
    if (bytes.length < 100 || bytes.length > MAX_VIDEO ||
        bytes.subarray(0, 4).toString("hex") !== "1a45dfa3") {
      throw Error("Invalid WebM output");
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/webm",
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="hyperframes-overlay.webm"',
      },
    });
  } catch (error) {
    console.error("[hyperframes-native] failed", error instanceof Error ? error.message.slice(0, 300) : "");
    return Response.json({ error: "Não foi possível renderizar a composição HyperFrames. Revise HTML/CSS e os logs do Editor." },
      { status: 502 });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    rendering = false;
  }
}
