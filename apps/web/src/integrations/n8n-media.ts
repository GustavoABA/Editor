import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	readdir,
	rename,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

export type N8nInboxMedia = {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	createdAt: string;
	importedAt?: string;
};

const automationRoot = process.env.AUTOMATION_DIR ?? "/tmp/opencut-automation";
const inboxDirectory = path.join(automationRoot, "n8n-inbox");
const safeIdPattern = /^[0-9a-f-]{36}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseN8nInboxMedia(value: unknown): N8nInboxMedia | null {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.name !== "string" ||
		typeof value.mimeType !== "string" ||
		typeof value.size !== "number" ||
		typeof value.createdAt !== "string" ||
		(value.importedAt !== undefined && typeof value.importedAt !== "string")
	) {
		return null;
	}
	return {
		id: value.id,
		name: value.name,
		mimeType: value.mimeType,
		size: value.size,
		createdAt: value.createdAt,
		...(typeof value.importedAt === "string"
			? { importedAt: value.importedAt }
			: {}),
	};
}

async function ensureInbox(): Promise<void> {
	await mkdir(inboxDirectory, { recursive: true });
}

function assertSafeId(mediaId: string): void {
	if (!safeIdPattern.test(mediaId)) throw new Error("Invalid n8n media id");
}

function metadataPath(mediaId: string): string {
	assertSafeId(mediaId);
	return path.join(inboxDirectory, `${mediaId}.json`);
}

export function mediaFilePath(mediaId: string): string {
	assertSafeId(mediaId);
	return path.join(inboxDirectory, `${mediaId}.bin`);
}

async function writeMetadata(metadata: N8nInboxMedia): Promise<void> {
	await ensureInbox();
	const destination = metadataPath(metadata.id);
	const temporary = `${destination}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(metadata), "utf8");
	await rename(temporary, destination);
}

export async function saveN8nInboxMedia({
	file,
}: {
	file: File;
}): Promise<N8nInboxMedia> {
	await ensureInbox();
	const id = randomUUID();
	const metadata: N8nInboxMedia = {
		id,
		name: file.name || `n8n-${id}`,
		mimeType: file.type || "application/octet-stream",
		size: file.size,
		createdAt: new Date().toISOString(),
	};
	await writeFile(mediaFilePath(id), Buffer.from(await file.arrayBuffer()));
	await writeMetadata(metadata);
	return metadata;
}

export async function readN8nInboxMedia({
	mediaId,
}: {
	mediaId: string;
}): Promise<N8nInboxMedia | null> {
	try {
		const value: unknown = JSON.parse(
			await readFile(metadataPath(mediaId), "utf8"),
		);
		return parseN8nInboxMedia(value);
	} catch {
		return null;
	}
}

export async function listN8nInboxMedia(): Promise<N8nInboxMedia[]> {
	await ensureInbox();
	const files = await readdir(inboxDirectory);
	const items = await Promise.all(
		files
			.filter((file) => file.endsWith(".json"))
			.map((file) =>
				readN8nInboxMedia({ mediaId: file.replace(/\.json$/, "") }),
			),
	);
	return items
		.filter((item): item is N8nInboxMedia => item !== null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markN8nInboxMediaImported({
	mediaId,
}: {
	mediaId: string;
}): Promise<N8nInboxMedia | null> {
	const current = await readN8nInboxMedia({ mediaId });
	if (!current) return null;
	const next = { ...current, importedAt: new Date().toISOString() };
	await writeMetadata(next);
	return next;
}

export async function getN8nInboxFileSize({
	mediaId,
}: {
	mediaId: string;
}): Promise<number> {
	return (await stat(mediaFilePath(mediaId))).size;
}
