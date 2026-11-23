import { afterAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const base = await mkdtemp(path.join(tmpdir(), "opencut-lan-sync-"));
process.env.LAN_SYNC_DIR = base;
process.env.LAN_SYNC_TOKEN = "local-test-token-that-is-long-enough";

const store = await import("./server");

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

test("LAN endpoints require the explicit separate secret", () => {
  expect(store.syncEnabled()).toBe(true);
  const denied = store.authorizeSync(new Request("http://localhost:3100/api/lan-sync/projects"));
  expect(denied?.status).toBe(401);
  const allowed = store.authorizeSync(
    new Request("http://localhost:3100/api/lan-sync/projects", {
      headers: { "x-lan-sync-token": process.env.LAN_SYNC_TOKEN! },
    }),
  );
  expect(allowed).toBeNull();
});

test("project revisions are persisted and stale writers fail", async () => {
  const projectId = "test_" + randomUUID();
  const document = {
    metadata: { id: projectId, name: "Teste LAN" },
    scenes: [],
    settings: { fps: 30 },
    version: 1,
  };
  const first = await store.saveProject({
    projectId,
    baseRevision: 0,
    document,
    assets: [],
  });
  expect(first.revision).toBe(1);
  expect(first.checkpointAt).toBeDefined();
  await expect(store.saveProject({ projectId, baseRevision: 0, document, assets: [] })).rejects.toThrow("Revision conflict");
  const second = await store.saveProject({
    projectId,
    baseRevision: 1,
    document,
    assets: [],
  });
  expect(second.revision).toBe(2);
  const checkpoint = await store.checkpointProject(projectId);
  expect(checkpoint?.checkpointAt).toBeDefined();
  expect((await store.readProject(projectId))?.revision).toBe(2);
  expect((await store.listProjects()).some((p) => p.id === projectId)).toBe(true);
});

test("chunk upload is resumable and original is SHA-256 verified", async () => {
  const projectId = "test_" + randomUUID();
  const assetId = "asset_" + randomUUID();
  const firstBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const secondBytes = Uint8Array.from([0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const checksums = [firstBytes, secondBytes].map((bytes) => createHash("sha256").update(bytes).digest("hex"));
  await store.storeChunk(projectId, assetId, 0, firstBytes.buffer, checksums[0]);
  expect(await store.listReceivedParts(projectId, assetId)).toEqual([0]);
  await store.storeChunk(projectId, assetId, 1, secondBytes.buffer, checksums[1]);
  const record = await store.finalizeAsset({
    projectId,
    assetId,
    name: "photo.png",
    type: "image",
    mimeType: "image/png",
    size: firstBytes.length + secondBytes.length,
    parts: 2,
    chunkSha256: checksums,
  });
  expect(record.size).toBe(firstBytes.length + secondBytes.length);
  expect(record.sha256).toHaveLength(64);
  expect(record.chunkSha256).toEqual(checksums);
  expect((await store.getAssetRecord(projectId, assetId))?.sha256).toBe(record.sha256);
  expect((await store.assetFileStat(projectId, assetId)).size).toBe(firstBytes.length + secondBytes.length);
  await expect(store.finalizeAsset({
    projectId, assetId, name: "photo.png", type: "image", mimeType: "image/png",
    size: record.size, parts: 2, chunkSha256: [checksums[0], "0".repeat(64)],
  })).rejects.toThrow("different original");
});

test("corrupted chunks and spoofed media declarations are rejected", async () => {
  const projectId = "integrity_" + randomUUID();
  const assetId = "asset_" + randomUUID();
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await expect(store.storeChunk(projectId, assetId, 0, bytes.buffer, "0".repeat(64))).rejects.toThrow("Chunk checksum mismatch");
  await store.storeChunk(projectId, assetId, 0, bytes.buffer, checksum);
  await expect(
    store.finalizeAsset({
      projectId,
      assetId,
      name: "fake.mp4",
      type: "video",
      mimeType: "video/mp4",
      size: bytes.length,
      parts: 1,
      chunkSha256: [checksum],
    }),
  ).rejects.toThrow("Media signature");
});

test("byte ranges support seeking and reject unsatisfiable requests", () => {
  expect(store.parseByteRange({ header: null, size: 100 })).toBeNull();
  expect(store.parseByteRange({ header: "bytes=10-19", size: 100 })).toEqual({
    start: 10,
    end: 19,
    length: 10,
  });
  expect(store.parseByteRange({ header: "bytes=90-", size: 100 })).toEqual({
    start: 90,
    end: 99,
    length: 10,
  });
  expect(store.parseByteRange({ header: "bytes=-5", size: 100 })).toEqual({
    start: 95,
    end: 99,
    length: 5,
  });
  expect(() => store.parseByteRange({ header: "bytes=100-101", size: 100 })).toThrow("Invalid byte range");
});

test("checkpoint history obeys the configured retention limit", async () => {
  process.env.LAN_SYNC_MAX_CHECKPOINTS = "2";
  const projectId = "history_" + randomUUID();
  let revision = 0;
  for (let index = 0; index < 4; index++) {
    const document = {
      metadata: { id: projectId, name: "History" },
      scenes: [],
      index,
    };
    const saved = await store.saveProject({
      projectId,
      baseRevision: revision,
      document,
      assets: [],
    });
    revision = saved.revision;
    await store.checkpointProject(projectId);
  }
  expect(await store.listCheckpointRevisions({ projectId })).toEqual([3, 4]);
  delete process.env.LAN_SYNC_MAX_CHECKPOINTS;
});

test("unsafe paths and incomplete uploads are rejected", async () => {
  await expect(store.storeChunk("../host", "asset", 0, new Uint8Array([1]).buffer)).rejects.toThrow("Invalid identifier");
  await expect(
    store.finalizeAsset({
      projectId: "project",
      assetId: "missing",
      name: "a",
      type: "image",
      mimeType: "image/png",
      size: 12,
      parts: 1,
      chunkSha256: ["0".repeat(64)],
    }),
  ).rejects.toThrow();
});
