import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import path from "node:path";

const root = process.env.LAN_SYNC_DIR || "/app/lan-sync";
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = 4096;
const SNAPSHOT_INTERVAL_MS = 180_000;
const DEFAULT_MAX_ASSET_BYTES = 16 * 1024 * 1024 * 1024;
const DEFAULT_MAX_PROJECT_BYTES = 64 * 1024 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINTS = 120;
const sha256Pattern = /^[a-f0-9]{64}$/;

export type AssetRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  sha256: string;
  chunkSha256?: string[];
  verifiedAt: string;
};

export type AssetReference = {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType?: string;
};

export type ProjectRecord = {
  revision: number;
  updatedAt: string;
  checkpointAt?: string;
  document: Record<string, unknown>;
  assets: AssetReference[];
};

function safeId(id: string): string {
  if (!idPattern.test(id)) throw new Error("Invalid identifier");
  return id;
}

function positiveIntegerEnvironment({ name, fallback }: { name: string; fallback: number }): number {
  const configured = Number(process.env[name]);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : fallback;
}

export function storageLimits() {
  return {
    maxAssetBytes: positiveIntegerEnvironment({
      name: "LAN_SYNC_MAX_ASSET_BYTES",
      fallback: DEFAULT_MAX_ASSET_BYTES,
    }),
    maxProjectBytes: positiveIntegerEnvironment({
      name: "LAN_SYNC_MAX_PROJECT_BYTES",
      fallback: DEFAULT_MAX_PROJECT_BYTES,
    }),
    maxCheckpoints: positiveIntegerEnvironment({
      name: "LAN_SYNC_MAX_CHECKPOINTS",
      fallback: DEFAULT_MAX_CHECKPOINTS,
    }),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectRoot(projectId: string): string {
  return path.join(root, "projects", safeId(projectId));
}

function assetRoot(projectId: string, assetId: string): string {
  return path.join(projectRoot(projectId), "assets", safeId(assetId));
}

function projectPath(projectId: string): string {
  return path.join(projectRoot(projectId), "current.json");
}

async function atomicJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function pruneCheckpoints({ projectId }: { projectId: string }): Promise<void> {
  const directory = path.join(projectRoot(projectId), "checkpoints");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const revisions = files
    .map((name) => ({ name, revision: /^(\d+)\.json$/.exec(name)?.[1] }))
    .filter((item): item is { name: string; revision: string } => Boolean(item.revision))
    .sort((a, b) => Number(b.revision) - Number(a.revision));
  await Promise.all(revisions.slice(storageLimits().maxCheckpoints).map((item) => rm(path.join(directory, item.name), { force: true })));
}

export async function listCheckpointRevisions({ projectId }: { projectId: string }): Promise<number[]> {
  const directory = path.join(projectRoot(projectId), "checkpoints");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  return files
    .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
    .filter((revision): revision is string => Boolean(revision))
    .map(Number)
    .sort((a, b) => a - b);
}

export function syncEnabled(): boolean {
  return Boolean(process.env.LAN_SYNC_TOKEN && process.env.LAN_SYNC_TOKEN.length >= 16);
}

export function authorizeSync(request: Request): Response | null {
  if (!syncEnabled()) return Response.json({ error: "LAN sync disabled: set LAN_SYNC_TOKEN (16+ chars) on host" }, { status: 503 });
  const expected = Buffer.from(process.env.LAN_SYNC_TOKEN!);
  const received = Buffer.from(request.headers.get("x-lan-sync-token") || "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ error: "LAN sync token is missing or incorrect" }, { status: 401 });
  }
  // Explicit token authorization protects these endpoints even from an anonymous editor page.
  return null;
}

export async function readProject(projectId: string): Promise<ProjectRecord | null> {
  try {
    const data: unknown = JSON.parse(await readFile(projectPath(projectId), "utf8"));
    if (!isRecord(data) || typeof data.revision !== "number" || !isRecord(data.document) || !Array.isArray(data.assets)) return null;
    return data as ProjectRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listProjects(): Promise<Array<{ id: string; name: string; revision: number; updatedAt: string }>> {
  const dir = path.join(root, "projects");
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const items = await Promise.all(
    names
      .filter((name) => idPattern.test(name))
      .map(async (id) => {
        const project = await readProject(id);
        if (!project) return null;
        const metadata = isRecord(project.document.metadata) ? project.document.metadata : {};
        return {
          id,
          name: typeof metadata.name === "string" ? metadata.name : id,
          revision: project.revision,
          updatedAt: project.updatedAt,
        };
      }),
  );
  return items.filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const mutexes = new Map<string, Promise<void>>();
async function exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const earlier = mutexes.get(id) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  mutexes.set(id, current);
  await earlier;
  try {
    return await operation();
  } finally {
    release();
    if (mutexes.get(id) === current) mutexes.delete(id);
  }
}

function validateAssets(input: unknown): AssetReference[] {
  if (!Array.isArray(input) || input.length > 3000) throw new Error("Invalid assets manifest");
  const assets = input.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.type !== "string" || typeof raw.size !== "number") throw new Error("Invalid asset metadata");
    safeId(raw.id);
    if (raw.name.length > 256 || raw.type.length > 32 || !Number.isSafeInteger(raw.size) || raw.size < 0 || raw.size > storageLimits().maxAssetBytes) throw new Error("Invalid asset metadata or asset quota exceeded");
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      size: raw.size,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType.slice(0, 120) : undefined,
    };
  });
  const total = assets.reduce((sum, asset) => sum + asset.size, 0);
  if (!Number.isSafeInteger(total) || total > storageLimits().maxProjectBytes) {
    throw new Error("Project storage quota exceeded");
  }
  return assets;
}

export async function saveProject(params: { projectId: string; baseRevision: number; document: unknown; assets: unknown }): Promise<ProjectRecord> {
  const { projectId, baseRevision, document, assets } = params;
  safeId(projectId);
  if (!isRecord(document) || !isRecord(document.metadata) || document.metadata.id !== projectId || !Array.isArray(document.scenes)) throw new Error("Invalid project document");
  if (Buffer.byteLength(JSON.stringify(document)) > MAX_DOCUMENT_BYTES) throw new Error("Project document exceeds 8 MB");
  const validated = validateAssets(assets);
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error("Invalid base revision");
  return exclusive(projectId, async () => {
    const previous = await readProject(projectId);
    const currentRevision = previous?.revision ?? 0;
    if (baseRevision !== currentRevision) {
      const error = new Error("Revision conflict");
      error.name = "RevisionConflict";
      throw error;
    }
    const now = new Date().toISOString();
    const next: ProjectRecord = {
      document,
      assets: validated,
      revision: currentRevision + 1,
      updatedAt: now,
      checkpointAt: previous?.checkpointAt,
    };
    const last = previous?.checkpointAt ? Date.parse(previous.checkpointAt) : 0;
    if (Date.now() - last >= SNAPSHOT_INTERVAL_MS) {
      next.checkpointAt = now;
      await atomicJson(path.join(projectRoot(projectId), "checkpoints", next.revision + ".json"), next);
      await pruneCheckpoints({ projectId });
    }
    await atomicJson(projectPath(projectId), next);
    return next;
  });
}

export async function checkpointProject(projectId: string): Promise<ProjectRecord | null> {
  return exclusive(projectId, async () => {
    const current = await readProject(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const next = { ...current, checkpointAt: now };
    await atomicJson(path.join(projectRoot(projectId), "checkpoints", current.revision + ".json"), next);
    await pruneCheckpoints({ projectId });
    await atomicJson(projectPath(projectId), next);
    return next;
  });
}

export async function getAssetRecord(projectId: string, assetId: string): Promise<AssetRecord | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path.join(assetRoot(projectId, assetId), "info.json"), "utf8"));
    return isRecord(data) && typeof data.sha256 === "string" ? (data as AssetRecord) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listReceivedParts(projectId: string, assetId: string): Promise<number[]> {
  const dir = path.join(assetRoot(projectId, assetId), "chunks");
  const filenames = await readdir(dir).catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? ([] as string[]) : Promise.reject(error)));
  return filenames
    .filter((name) => /^\d+\.part$/.test(name))
    .map((name) => Number(name.split(".")[0]))
    .filter((n) => Number.isSafeInteger(n) && n < MAX_PARTS);
}

export async function storeChunk(projectId: string, assetId: string, part: number, bytes: ArrayBuffer, expectedSha256?: string): Promise<void> {
  safeId(projectId);
  safeId(assetId);
  if (!Number.isSafeInteger(part) || part < 0 || part >= MAX_PARTS || bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) throw new Error("Invalid chunk");
  if (expectedSha256 !== undefined) {
    if (!sha256Pattern.test(expectedSha256)) throw new Error("Invalid chunk checksum");
    const actualSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    if (actualSha256 !== expectedSha256) throw new Error("Chunk checksum mismatch");
  }
  const file = path.join(assetRoot(projectId, assetId), "chunks", part + ".part");
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, Buffer.from(bytes));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function finalizeAsset(params: { projectId: string; assetId: string; name: string; type: string; mimeType: string; size: number; parts: number; chunkSha256?: string[] }): Promise<AssetRecord> {
  const { projectId, assetId, name, type, mimeType, size, parts, chunkSha256 } = params;
  safeId(projectId);
  safeId(assetId);
  if (typeof name !== "string" || name.length === 0 || name.length > 256 || typeof type !== "string" || type.length > 32 || typeof mimeType !== "string" || mimeType.length > 120 || !Number.isSafeInteger(parts) || parts < 1 || parts > MAX_PARTS || !Number.isSafeInteger(size) || size < 1 || size > Math.min(MAX_PARTS * MAX_CHUNK_BYTES, storageLimits().maxAssetBytes)) throw new Error("Invalid file details or asset quota exceeded");
  if (!Array.isArray(chunkSha256) || chunkSha256.length !== parts || chunkSha256.some((value) => typeof value !== "string" || !sha256Pattern.test(value))) {
    throw new Error("A SHA-256 checksum is required for every chunk");
  }
  const existing = await getAssetRecord(projectId, assetId);
  if (existing) {
    if (existing.size === size && existing.chunkSha256?.length === chunkSha256.length && existing.chunkSha256.every((value, index) => value === chunkSha256[index])) return existing;
    throw new Error("Asset identifier already belongs to a different original");
  }
  const folder = assetRoot(projectId, assetId);
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, "original");
  const temporary = target + "." + randomUUID() + ".tmp";
  const writer = createWriteStream(temporary, { flags: "wx" });
  // Keep write errors observable via finished() instead of unhandled stream events.
  writer.on("error", () => undefined);
  const hash = createHash("sha256");
  let total = 0;
  try {
    for (let part = 0; part < parts; part++) {
      const chunkPath = path.join(folder, "chunks", part + ".part");
      await access(chunkPath);
      const chunkHash = createHash("sha256");
      for await (const bytes of createReadStream(chunkPath)) {
        const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
        total += buffer.length;
        if (total > size) throw new Error("Received more bytes than expected");
        hash.update(buffer);
        chunkHash.update(buffer);
        if (!writer.write(buffer)) await once(writer, "drain");
      }
      if (chunkHash.digest("hex") !== chunkSha256[part]) throw new Error("Stored chunk checksum mismatch");
    }
    if (total !== size) throw new Error("Incomplete file upload");
    writer.end();
    await finished(writer);
    await validateMediaSignature({ file: temporary, type, mimeType });
    await rename(temporary, target);
    const record: AssetRecord = {
      id: assetId,
      name,
      type,
      mimeType,
      size,
      sha256: hash.digest("hex"),
      chunkSha256,
      verifiedAt: new Date().toISOString(),
    };
    await atomicJson(path.join(folder, "info.json"), record);
    await rm(path.join(folder, "chunks"), { recursive: true, force: true });
    return record;
  } catch (error) {
    writer.destroy();
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function validateMediaSignature({ file, type, mimeType }: { file: string; type: string; mimeType: string }): Promise<void> {
  if (!["video", "audio", "image"].includes(type)) throw new Error("Unsupported media type");
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const ascii = bytes.toString("ascii");
    const isoBrand = ascii.slice(8, 12).toLowerCase();
    const isoImageSignature = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif", "avis"].includes(isoBrand);
    const imageSignature = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || ascii.startsWith("GIF8") || (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") || ascii.startsWith("BM") || ascii.startsWith("II*") || ascii.startsWith("MM\u0000*") || isoImageSignature;
    const audioSignature = (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") || ascii.startsWith("fLaC") || ascii.startsWith("OggS") || ascii.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    const isoMediaSignature = ascii.slice(4, 8) === "ftyp";
    const videoSignature = (isoMediaSignature && !isoImageSignature) || bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "AVI ") || bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0xb3]));
    const matches = type === "image" ? imageSignature : type === "audio" ? audioSignature || isoMediaSignature : videoSignature;
    if (!matches) throw new Error("Media signature does not match its declared type");
    const declaredTopLevel = mimeType.split("/", 1)[0];
    if (declaredTopLevel !== type) throw new Error("MIME type does not match its declared media type");
  } finally {
    await handle.close();
  }
}

export type ByteRange = { start: number; end: number; length: number };

export function parseByteRange({ header, size }: { header: string | null; size: number }): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid byte range");
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("Invalid byte range");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error("Invalid byte range");
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

export function assetFilePath(projectId: string, assetId: string): string {
  return path.join(assetRoot(projectId, assetId), "original");
}

export async function assetFileStat(projectId: string, assetId: string) {
  return stat(assetFilePath(projectId, assetId));
}

export function assetFileStream(projectId: string, assetId: string, range?: { start: number; end: number }) {
  return createReadStream(assetFilePath(projectId, assetId), range);
}
