// Native, on-demand HyperFrames renderer. Invoked by the Editor's own Next.js
// backend as a single child process: no daemon, HTTP endpoint or second service.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, stat, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sanitizeHtml from "sanitize-html";

const run = promisify(execFile);
const MAX_VIDEO = 55 * 1024 * 1024;
const MAX_JSON = 96_000;

export function sanitizeComposition({ html, css }) {
  if (typeof html !== "string" || html.length < 1 || html.length > 26_000 ||
      typeof css !== "string" || css.length > 26_000) {
    throw Error("HTML/CSS deve ter no máximo 26 KB por campo.");
  }
  // Generated markup must not read host files, run scripts or load resources.
  // Do not treat the browser iframe's CSP as sufficient by itself.
  if (/(?:@import|@font-face|url\s*\(|expression\s*\(|javascript:|data:|\\|<!--|<\s*\/??\s*(?:script|iframe|object|embed|link|style|svg|math|video|audio|form|meta|base)\b)/i.test(css + html)) {
    throw Error("Composição possui scripts, recursos externos ou estilo proibido.");
  }
  const clean = sanitizeHtml(html, {
    allowedTags: ["div","span","p","h1","h2","h3","h4","h5","h6",
      "section","article","header","footer","main","strong","em","small",
      "b","i","ul","ol","li","br","hr","table","thead","tbody","tr","th","td"],
    allowedAttributes: { "*": ["id","class","title","data-start","data-duration","data-track-index"] },
    disallowedTagsMode: "discard",
  });
  if (!clean.trim()) throw Error("HTML sem elementos permitidos.");
  return clean;
}

export function compositionHtml({ html, css, width, height, duration }) {
  const safe = sanitizeComposition({ html, css });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
 content="default-src 'none'; script-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;padding:0;background:transparent;overflow:hidden}
#opencut-hyperframes{width:${width}px;height:${height}px;position:relative;overflow:hidden}
#opencut-hyperframes>.clip{width:100%;height:100%;position:absolute;left:0;top:0}
${css}
</style></head><body>
<div id="opencut-hyperframes" data-composition-id="opencut-hyperframes"
 data-start="0" data-width="${width}" data-height="${height}">
<div id="opencut-overlay" class="clip" data-start="0" data-duration="${duration}" data-track-index="0">
${safe}
</div></div></body></html>`;
}

export function validateJob(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Composição inválida.");
  const width = Number(body.width), height = Number(body.height);
  const duration = Number(body.duration), fps = Number(body.fps);
  if (![width,height,duration,fps].every(Number.isFinite) ||
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 240 || height < 240 || width > 1920 || height > 1920 ||
      width * height > 2_100_000 || duration < 0.3 || duration > 12 ||
      ![24,30].includes(fps)) {
    throw Error("Dimensões, FPS ou duração fora dos limites.");
  }
  return { width, height, duration, fps, html: body.html, css: body.css };
}

export async function renderToFile(body, destination) {
  const job = validateJob(body);
  let directory;
  try {
    directory = await mkdtemp(join(tmpdir(), "opencut-hf-"));
    await writeFile(join(directory, "index.html"), compositionHtml(job),
      { encoding: "utf8", mode: 0o600 });
    const output = join(directory, "overlay.webm");
    const binary = fileURLToPath(new URL("./node_modules/.bin/hyperframes", import.meta.url));
    await run(binary, ["render", "--format", "webm", "--output", output,
      "--fps", String(job.fps), "--quality", "draft", "--workers", "1"], {
      cwd: directory,
      timeout: 210_000,
      maxBuffer: 150_000,
      env: {
        PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME || "/tmp",
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || "/tmp/.cache",
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || "/tmp/.config",
        PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        CHROME_BIN: process.env.CHROME_BIN || "/usr/bin/chromium",
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        NO_PROXY: "*",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
      },
    });
    const info = await stat(output);
    if (info.size < 100 || info.size > MAX_VIDEO) throw Error("WebM vazio ou acima de 55 MiB.");
    const signature = (await readFile(output)).subarray(0,4).toString("hex");
    if (signature !== "1a45dfa3") throw Error("WebM gerado está corrompido.");
    await copyFile(output, destination);
    return { size: info.size };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output) {
    console.error("Uso: node server.mjs <input.json> <output.webm>");
    process.exitCode = 2;
  } else {
    try {
      const raw = await readFile(input);
      if (raw.length < 1 || raw.length > MAX_JSON) throw Error("JSON acima do limite de 96 KB.");
      const result = await renderToFile(JSON.parse(raw.toString("utf8")), output);
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Renderização indisponível.");
      process.exitCode = 1;
    }
  }
}
