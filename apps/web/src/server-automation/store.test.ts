import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(tmpdir(), "opencut-automation-"));
process.env.AUTOMATION_DIR = root;
const store = await import("./store");

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test("queued automation commands get a finite default expiry", async () => {
  const command = await store.createAutomationCommand({
    sessionId: randomUUID(),
    type: "apply_plan",
    payload: { commands: [{ type: "split_at", payload: { seconds: 1 } }] },
  });
  expect(Date.parse(command.expiresAt)).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1_000);
});

test("expired commands are never delivered after a reconnect", async () => {
  const sessionId = randomUUID();
  const command = await store.createAutomationCommand({
    sessionId,
    type: "apply_plan",
    payload: { commands: [{ type: "split_at", payload: { seconds: 1 } }] },
  });
  const file = path.join(root, "commands", `${command.id}.json`);
  const persisted = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...persisted, expiresAt: new Date(0).toISOString() }));
  expect(await store.listQueuedAutomationCommands({ sessionId })).toEqual([]);
  expect((await store.readAutomationCommand({ commandId: command.id }))?.status).toBe("expired");
});
