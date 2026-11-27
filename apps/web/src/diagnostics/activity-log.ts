export type ActivityLogLevel = "info" | "warn" | "error";

export type ActivityLogEntry = {
	id: string;
	at: string;
	level: ActivityLogLevel;
	source: string;
	message: string;
};

const STORAGE_KEY = "cut-editor:activity-log:v1";
const MAX_AGE_MS = 5 * 60 * 60 * 1000;
const MAX_ENTRIES = 1_000;

type StoredLog = { startedAt: number; projectId: string | null; entries: ActivityLogEntry[] };

function isBrowser() {
	return typeof window !== "undefined";
}

function newStoredLog(projectId: string | null): StoredLog {
	return { startedAt: Date.now(), projectId, entries: [] };
}

function readStoredLog(): StoredLog {
	if (!isBrowser()) return newStoredLog(null);
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return newStoredLog(null);
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return newStoredLog(null);
		const value = parsed as Partial<StoredLog>;
		if (typeof value.startedAt !== "number" || Date.now() - value.startedAt > MAX_AGE_MS ||
			!Array.isArray(value.entries)) {
			window.sessionStorage.removeItem(STORAGE_KEY);
			return newStoredLog(null);
		}
		return {
			startedAt: value.startedAt,
			projectId: typeof value.projectId === "string" ? value.projectId : null,
			entries: value.entries.filter(isLogEntry).slice(-MAX_ENTRIES),
		};
	} catch {
		return newStoredLog(null);
	}
}

function isLogEntry(value: unknown): value is ActivityLogEntry {
	if (!isRecord(value)) return false;
	return typeof value.id === "string" && typeof value.at === "string" &&
		typeof value.level === "string" && typeof value.source === "string" &&
		typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

class ActivityLog {
	private stored = readStoredLog();
	private listeners = new Set<() => void>();
	private cleanupTimer: number | null = null;

	start({ projectId }: { projectId: string }) {
		if (this.stored.projectId !== projectId || Date.now() - this.stored.startedAt > MAX_AGE_MS) {
			this.stored = newStoredLog(projectId);
		}
		this.record({ source: "session", message: "Sessão de edição iniciada." });
		this.scheduleExpiry();
	}

	record({ source, message, level = "info" }: { source: string; message: string; level?: ActivityLogLevel }) {
		const entry: ActivityLogEntry = {
			id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
			at: new Date().toISOString(),
			level,
			source: source.slice(0, 80),
			message: message.slice(0, 800),
		};
		this.stored.entries = [...this.stored.entries, entry].slice(-MAX_ENTRIES);
		this.persist();
		this.notify();
	}

	getEntries(): ActivityLogEntry[] {
		this.expireIfNeeded();
		return this.stored.entries;
	}

	toText(): string {
		return this.getEntries().map((entry) =>
			`[${entry.at}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`,
		).join("\n");
	}

	clear() {
		this.stored = newStoredLog(this.stored.projectId);
		this.persist();
		this.notify();
	}

	end() {
		if (!isBrowser()) return;
		window.sessionStorage.removeItem(STORAGE_KEY);
		this.stored = newStoredLog(null);
		this.notify();
	}

	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private persist() {
		if (!isBrowser()) return;
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	private expireIfNeeded() {
		if (Date.now() - this.stored.startedAt <= MAX_AGE_MS) return;
		this.end();
	}

	private scheduleExpiry() {
		if (!isBrowser()) return;
		if (this.cleanupTimer !== null) window.clearTimeout(this.cleanupTimer);
		const remaining = Math.max(0, this.stored.startedAt + MAX_AGE_MS - Date.now());
		this.cleanupTimer = window.setTimeout(() => this.end(), remaining);
	}
}

export const activityLog = new ActivityLog();
