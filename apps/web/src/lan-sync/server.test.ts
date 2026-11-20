import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
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
  const allowed = store.authorizeSync(new Request("http://localhost:3100/api/lan-sync/projects", {
    headers: { "x-lan-sync-token": process.env.LAN_SYNC_TOKEN! },
  }));
  expect(allowed).toBeNull();
});

test("project revisions are persisted and stale writers fail", async () => {
  const projectId = "test_" + randomUUID();
  const document = { metadata: { id: projectId, name: "Teste LAN" }, scenes: [], settings: { fps: 30 }, version: 1 };
  const first = await store.saveProject({ projectId, baseRevision: 0, document, assets: [] });
  expect(first.revision).toBe(1);
  expect(first.checkpointAt).toBeDefined();
  await expect(store.saveProject({ projectId, baseRevision: 0, document, assets: [] })).rejects.toThrow("Revision conflict");
  const second = await store.saveProject({ projectId, baseRevision: 1, document, assets: [] });
  expect(second.revision).toBe(2);
  const checkpoint = await store.checkpointProject(projectId);
  expect(checkpoint?.checkpointAt).toBeDefined();
  expect((await store.readProject(projectId))?.revision).toBe(2);
  expect((await store.listProjects()).some((p) => p.id === projectId)).toBe(true);
});

test("chunk upload is resumable and original is SHA-256 verified", async () => {
  const projectId = "test_" + randomUUID();
  const assetId = "asset_" + randomUUID();
  await store.storeChunk(projectId, assetId, 0, new Uint8Array([1, 2, 3]).buffer);
  expect(await store.listReceivedParts(projectId, assetId)).toEqual([0]);
  await store.storeChunk(projectId, assetId, 1, new Uint8Array([4, 5]).buffer);
  const record = await store.finalizeAsset({
    projectId, assetId, name: "photo.png", type: "image",
    mimeType: "image/png", size: 5, parts: 2,
  });
  expect(record.size).toBe(5);
  expect(record.sha256).toHaveLength(64);
  expect((await store.getAssetRecord(projectId, assetId))?.sha256).toBe(record.sha256);
  expect((await store.assetFileStat(projectId, assetId)).size).toBe(5);
});

test("unsafe paths and incomplete uploads are rejected", async () => {
  await expect(store.storeChunk("../host", "asset", 0, new Uint8Array([1]).buffer)).rejects.toThrow("Invalid identifier");
  await expect(store.finalizeAsset({
    projectId: "project", assetId: "missing", name: "a", type: "image",
    mimeType: "image/png", size: 12, parts: 1,
  })).rejects.toThrow();
});
