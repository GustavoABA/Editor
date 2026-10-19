import type { StorageAdapter } from "./types";

export class OPFSAdapter implements StorageAdapter<File> {
	private directoryName: string;

	constructor(directoryName = "media") {
		this.directoryName = directoryName;
	}

	private async getDirectory(): Promise<FileSystemDirectoryHandle> {
		const opfsRoot = await navigator.storage.getDirectory();
		return await opfsRoot.getDirectoryHandle(this.directoryName, {
			create: true,
		});
	}

	private fallbackKey({ key }: { key: string }): string {
		return `${this.directoryName}:${key}`;
	}

	private async getFallbackDb(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open("opencut-media-files", 1);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("files")) {
					db.createObjectStore("files", { keyPath: "id" });
				}
			};
		});
	}

	private async getFallbackFile({ key }: { key: string }): Promise<File | null> {
		const db = await this.getFallbackDb();
		return new Promise((resolve, reject) => {
			const request = db
				.transaction("files", "readonly")
				.objectStore("files")
				.get(this.fallbackKey({ key }));
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result?.file ?? null);
		});
	}

	private async setFallbackFile({ key, file }: { key: string; file: File }): Promise<void> {
		const db = await this.getFallbackDb();
		return new Promise((resolve, reject) => {
			const request = db
				.transaction("files", "readwrite")
				.objectStore("files")
				.put({ id: this.fallbackKey({ key }), directory: this.directoryName, file });
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async get(key: string): Promise<File | null> {
		if (!OPFSAdapter.isSupported()) {
			return this.getFallbackFile({ key });
		}
		try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key);
			return await fileHandle.getFile();
		} catch (error) {
			if ((error as Error).name === "NotFoundError") {
				return null;
			}
			throw error;
		}
	}

	async set({
		key,
		value: file,
	}: {
		key: string;
		value: File;
	}): Promise<void> {
		if (!OPFSAdapter.isSupported()) {
			return this.setFallbackFile({ key, file });
		}
		const directory = await this.getDirectory();
		const fileHandle = await directory.getFileHandle(key, { create: true });
		const writable = await fileHandle.createWritable();

		await writable.write(file);
		await writable.close();
	}

	async remove(key: string): Promise<void> {
		if (!OPFSAdapter.isSupported()) {
			const db = await this.getFallbackDb();
			return new Promise((resolve, reject) => {
				const request = db
					.transaction("files", "readwrite")
					.objectStore("files")
					.delete(this.fallbackKey({ key }));
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		}
		try {
			const directory = await this.getDirectory();
			await directory.removeEntry(key);
		} catch (error) {
			if ((error as Error).name !== "NotFoundError") {
				throw error;
			}
		}
	}

	async list(): Promise<string[]> {
		if (!OPFSAdapter.isSupported()) {
			const db = await this.getFallbackDb();
			return new Promise((resolve, reject) => {
				const request = db
					.transaction("files", "readonly")
					.objectStore("files")
					.getAll();
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(
						request.result
							.filter((entry) => entry.directory === this.directoryName)
							.map((entry) => entry.id.slice(this.directoryName.length + 1)),
					);
			});
		}
		const directory = await this.getDirectory();
		const keys: string[] = [];

		for await (const name of directory.keys()) {
			keys.push(name);
		}

		return keys;
	}

	async clear(): Promise<void> {
		if (!OPFSAdapter.isSupported()) {
			const keys = await this.list();
			await Promise.all(keys.map((key) => this.remove(key)));
			return;
		}
		const directory = await this.getDirectory();

		for await (const name of directory.keys()) {
			await directory.removeEntry(name);
		}
	}

	// Helper method to check OPFS support
	static isSupported(): boolean {
		// OPFS is exposed by some browsers on HTTP origins but can only be
		// opened in a secure context. LAN access through an IP is normally HTTP,
		// so use the IndexedDB fallback instead of accepting uploads that cannot
		// be read back by the renderer.
		return (
			window.isSecureContext &&
			"storage" in navigator &&
			"getDirectory" in navigator.storage
		);
	}
}
