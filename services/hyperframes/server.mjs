import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import sanitizeHtml from "sanitize-html";

const run = promisify(execFile);
const PORT = Number(process.env.PORT || 8712);
const MAX_JSON = 96_000;
const MAX_VIDEO = 55 * 1024 * 1024;
let active = false;

function authenticated(request) {
  const expected = process.env.HYPERFRAMES_INTERNAL_TOKEN || "";
  const supplied = request.headers["x-hyperframes-token"] || "";
  if (expected.length < 16 || typeof supplied !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}
function validSource({ html, css }) {
  if (typeof html !== "string" || html.length < 1 || html.length > 26_000 ||
      typeof css !== "string" || css.length > 26_000) throw Error("Limite HTML/CSS excedido.");
  // No user scripts, handlers, iframes, embedded requests, imported style sheets,
  // data URLs or external files. Renderer also runs on an internal-only network
  // with no volumes, credentials or direct access to the internet.
  if (/(?:@import|@font-face|url\s*\(|expression\s*\(|javascript:|data:|\\|<!--|<\s*\/??\s*(?:script|iframe|object|embed|link|style|svg|math|video|audio|form|meta|base)\b)/i.test(css + html))
    throw Error("Composição contém scripts, recursos externos ou estilo inseguro.");
  const clean = sanitizeHtml(html, {
    allowedTags: ["div","span","p","h1","h2","h3","h4","h5","h6","section",
      "article","header","footer","main","strong","em","small","b","i","ul","ol","li",
      "br","hr","table","thead","tbody","tr","th","td"],
    allowedAttributes: { "*": ["id","class","title","data-start","data-duration","data-track-index"] },
    disallowedTagsMode: "discard",
  });
  if (!clean.trim()) throw Error("O HTML não contém elementos permitidos.");
  return clean;
}
function buildComposition({ html, css, width, height, duration }) {
  const content = validSource({ html, css });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
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
    ${content}
  </div>
</div>
</body></html>`;
}
async function readJsonBody(request) {
  let size = 0;
  const buffers = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON) throw Error("Composição acima do limite de 96 KB.");
    buffers.push(chunk);
  }
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}
async function render(request, response) {
  if (active) return json(response, 429, { error: "Renderizador ocupado; tente novamente." });
  active = true;
  let directory;
  try {
    const body = await readJsonBody(request);
    const width = Number(body.width), height = Number(body.height);
    const duration = Number(body.duration), fps = Number(body.fps);
    if (![width,height,duration,fps].every(Number.isFinite) ||
        !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 240 || height < 240 || width > 1920 || height > 1920 ||
        width * height > 2_100_000 || duration < 0.3 || duration > 12 ||
        ![24,30].includes(fps))
      throw Error("Dimensões, FPS ou duração fora dos limites.");
    const html = buildComposition({ html: body.html, css: body.css, width, height, duration });
    directory = await mkdtemp(join(tmpdir(), "opencut-hf-"));
    await writeFile(join(directory, "index.html"), html, { encoding: "utf8", mode: 0o600 });
    const output = join(directory, "overlay.webm");
    // CLI names and flags follow official HyperFrames CLI documentation. Never
    // interpolate generated text into a shell command.
    await run(join(process.cwd(), "node_modules/.bin/hyperframes"),
      ["render", "--format", "webm", "--output", output,
       "--fps", String(fps), "--quality", "draft", "--workers", "1"],
      { cwd: directory, timeout: 210_000, maxBuffer: 150_000,
        env: { ...process.env, NO_PROXY: "*", HYPERFRAMES_NO_UPDATE_CHECK: "1" } });
    const meta = await stat(output);
    if (meta.size < 100 || meta.size > MAX_VIDEO) throw Error("Arquivo WebM vazio ou maior que 55 MiB.");
    const bytes = await readFile(output);
    response.writeHead(200, { "Content-Type": "video/webm",
      "Content-Length": bytes.length, "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="hyperframes-overlay.webm"' });
    response.end(bytes);
  } catch (error) {
    console.error("[hyperframes-render]", error instanceof Error ? error.message : "unknown error");
    json(response, 422, { error: error instanceof Error ? error.message.slice(0, 180) : "Render falhou." });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    active = false;
  }
}
createServer(async (request, response) => {
  if (!authenticated(request)) return json(response, 401, { error: "Token interno inválido." });
  if (request.method === "GET" && request.url === "/health")
    return json(response, 200, { ready: true, busy: active });
  if (request.method === "POST" && request.url === "/render")
    return render(request, response);
  return json(response, 404, { error: "Not found." });
}).listen(PORT, "0.0.0.0", () => {
  console.log("[hyperframes-render] private worker ready");
});
