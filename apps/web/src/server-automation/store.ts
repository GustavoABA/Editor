import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type AutomationCommandStatus =
	| "queued"
	| "running"
	| "complete"
	| "failed";

export type AutomationSession = {
	id: string;
	projectId: string;
	projectName: string;
	url: string;
	lastSeen: string;
	snapshot: Record<string, unknown>;
};

export type AutomationCommand = {
	id: string;
	sessionId: string;
	type: string;
	payload: Record<string, unknown>;
	status: AutomationCommandStatus;
	createdAt: string;
	updatedAt: string;
	result?: Record<string, unknown>;
	error?: string;
};

const automationRoot = process.env.AUTOMATION_DIR ?? "/tmp/opencut-automation";
const sessionsDirectory = path.join(automationRoot, "sessions");
const commandsDirectory = path.join(automationRoot, "commands");
const safeIdPattern = /^[0-9a-f-]{16,64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommandStatus(value: unknown): value is AutomationCommandStatus {
	return (
		value === "queued" ||
		value === "running" ||
		value === "complete" ||
		value === "failed"
	);
}

function parseAutomationSession(value: unknown): AutomationSession | null {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.projectId !== "string" ||
		typeof value.projectName !== "string" ||
		typeof value.url !== "string" ||
		typeof value.lastSeen !== "string" ||
		!isRecord(value.snapshot)
	) {
		return null;
	}
	return {
		id: value.id,
		projectId: value.projectId,
		projectName: value.projectName,
		url: value.url,
		lastSeen: value.lastSeen,
		snapshot: value.snapshot,
	};
}

function parseAutomationCommand(value: unknown): AutomationCommand | null {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.sessionId !== "string" ||
		typeof value.type !== "string" ||
		!isRecord(value.payload) ||
		!isCommandStatus(value.status) ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string" ||
		(value.result !== undefined && !isRecord(value.result)) ||
		(value.error !== undefined && typeof value.error !== "string")
	) {
		return null;
	}
	return {
		id: value.id,
		sessionId: value.sessionId,
		type: value.type,
		payload: value.payload,
		status: value.status,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		...(isRecord(value.result) ? { result: value.result } : {}),
		...(typeof value.error === "string" ? { error: value.error } : {}),
	};
}

async function ensureDirectories(): Promise<void> {
	await Promise.all([
		mkdir(sessionsDirectory, { recursive: true }),
		mkdir(commandsDirectory, { recursive: true }),
	]);
}

function assertSafeId(id: string): void {
	if (!safeIdPattern.test(id)) throw new Error("Invalid automation id");
}

async function writeJsonAtomic({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}): Promise<void> {
	await ensureDirectories();
	const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, JSON.stringify(value), "utf8");
	await rename(temporaryPath, filePath);
}

async function readJson({
	filePath,
}: {
	filePath: string;
}): Promise<unknown | null> {
	try {
		const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
		return value;
	} catch {
		return null;
	}
}

async function listJson<T>({
	directory,
	parse,
}: {
	directory: string;
	parse: (value: unknown) => T | null;
}): Promise<T[]> {
	await ensureDirectories();
	const files = await readdir(directory);
	const values: T[] = [];
	for (const file of files) {
		if (!file.endsWith(".json")) continue;
		const value = parse(
			await readJson({ filePath: path.join(directory, file) }),
		);
		if (value !== null) values.push(value);
	}
	return values;
}

function sessionPath(sessionId: string): string {
	assertSafeId(sessionId);
	return path.join(sessionsDirectory, `${sessionId}.json`);
}

function commandPath(commandId: string): string {
	assertSafeId(commandId);
	return path.join(commandsDirectory, `${commandId}.json`);
}

export async function upsertAutomationSession({
	session,
}: {
	session: Omit<AutomationSession, "lastSeen">;
}): Promise<AutomationSession> {
	const nextSession = { ...session, lastSeen: new Date().toISOString() };
	await writeJsonAtomic({
		filePath: sessionPath(session.id),
		value: nextSession,
	});
	return nextSession;
}

export async function listAutomationSessions(): Promise<
	Array<AutomationSession & { online: boolean }>
> {
	const now = Date.now();
	const sessions = await listJson<AutomationSession>({
		directory: sessionsDirectory,
		parse: parseAutomationSession,
	});
	return sessions
		.map((session) => ({
			...session,
			online: now - new Date(session.lastSeen).getTime() < 15_000,
		}))
		.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function readAutomationSession({
	sessionId,
}: {
	sessionId: string;
}): Promise<AutomationSession | null> {
	return parseAutomationSession(
		await readJson({ filePath: sessionPath(sessionId) }),
	);
}

export async function createAutomationCommand({
	sessionId,
	type,
	payload,
}: {
	sessionId: string;
	type: string;
	payload: Record<string, unknown>;
}): Promise<AutomationCommand> {
	assertSafeId(sessionId);
	const now = new Date().toISOString();
	const command: AutomationCommand = {
		id: randomUUID(),
		sessionId,
		type,
		payload,
		status: "queued",
		createdAt: now,
		updatedAt: now,
	};
	await writeJsonAtomic({ filePath: commandPath(command.id), value: command });
	return command;
}

export async function readAutomationCommand({
	commandId,
}: {
	commandId: string;
}): Promise<AutomationCommand | null> {
	return parseAutomationCommand(
		await readJson({ filePath: commandPath(commandId) }),
	);
}

export async function listQueuedAutomationCommands({
	sessionId,
}: {
	sessionId: string;
}): Promise<AutomationCommand[]> {
	assertSafeId(sessionId);
	const commands = await listJson<AutomationCommand>({
		directory: commandsDirectory,
		parse: parseAutomationCommand,
	});
	return commands
		.filter(
			(command) =>
				command.sessionId === sessionId && command.status === "queued",
		)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateAutomationCommand({
	commandId,
	patch,
}: {
	commandId: string;
	patch: Pick<AutomationCommand, "status"> &
		Partial<Pick<AutomationCommand, "result" | "error">>;
}): Promise<AutomationCommand | null> {
	const command = await readAutomationCommand({ commandId });
	if (!command) return null;
	const nextCommand: AutomationCommand = {
		...command,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	await writeJsonAtomic({
		filePath: commandPath(commandId),
		value: nextCommand,
	});
	return nextCommand;
}
