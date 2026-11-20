"use client";

import type { MediaAsset } from "@/media/types";

const TOKEN_KEY = "opencut-lan-sync-token";
const REVISION_KEY = "opencut-lan-sync-revision:";
const CHUNK_BYTES = 4 * 1024 * 1024;

export class LanSyncError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "LanSyncError";
  }
}

export function getLanToken(): string {
  return typeof window === "undefined" ? "" : sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setLanToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getKnownRevision(projectId: string): number | null {
  const raw = typeof window === "undefined" ? null : sessionStorage.getItem(REVISION_KEY + projectId);
  return raw !== null && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
}

export function setKnownRevision(projectId: string, revision: number): void {
  sessionStorage.setItem(REVISION_KEY + projectId, String(revision));
}

export type RemoteAsset = {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType?: string;
  uploaded: boolean;
};

export type RemoteProject = {
  revision: number;
  updatedAt: string;
  checkpointAt?: string;
  document: Record<string, unknown>;
  assets: RemoteAsset[];
};

export async function lanRequest(route: string, options: RequestInit = {}): Promise<Response> {
  const token = getLanToken();
  if (!token) throw new LanSyncError("Configure o token da LAN antes de sincronizar.", 401);
  const headers = new Headers(options.headers);
  headers.set("x-lan-sync-token", token);
  const response = await fetch("/api/lan-sync/" + route, {
    ...options,
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const description = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "A comunicação com o host falhou";
    throw new LanSyncError(description, response.status);
  }
  return response;
}

export async function readRemoteProject(projectId: string): Promise<RemoteProject | null> {
  try {
    const response = await lanRequest("projects/" + encodeURIComponent(projectId));
    return await response.json() as RemoteProject;
  } catch (error) {
    if (error instanceof LanSyncError && error.status === 404) return null;
    throw error;
  }
}

export async function listRemoteProjects(): Promise<Array<{ id: string; name: string; revision: number; updatedAt: string }>> {
  const response = await lanRequest("projects");
  const payload = await response.json() as { projects: Array<{ id: string; name: string; revision: number; updatedAt: string }> };
  return payload.projects;
}

export async function saveRemoteProject(args: {
  projectId: string;
  document: Record<string, unknown>;
  assets: Array<{ id: string; name: string; type: string; size: number; mimeType?: string }>;
  baseRevision: number;
}): Promise<{ revision: number; checkpointAt?: string }> {
  const response = await lanRequest("projects/" + encodeURIComponent(args.projectId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseRevision: args.baseRevision, document: args.document, assets: args.assets }),
  });
  return await response.json() as { revision: number; checkpointAt?: string };
}

export async function checkpointRemoteProject(projectId: string): Promise<void> {
  await lanRequest("projects/" + encodeURIComponent(projectId) + "/checkpoint", { method: "POST" });
}

export async function uploadRemoteAsset(args: {
  projectId: string;
  asset: MediaAsset;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const { projectId, asset, onProgress } = args;
  const route = "projects/" + encodeURIComponent(projectId) + "/assets/" + encodeURIComponent(asset.id);
  const check = await lanRequest(route);
  const status = await check.json() as { uploaded: boolean; parts: number[]; info?: { size: number } };
  if (status.uploaded && status.info?.size === asset.file.size) {
    onProgress?.(1);
    return;
  }
  if (asset.file.size === 0) throw new Error("Arquivo vazio não pode ser enviado");
  const parts = Math.ceil(asset.file.size / CHUNK_BYTES);
  if (parts > 4096) throw new Error("Arquivo acima do limite de partes do servidor");
  const completed = new Set(status.parts);
  for (let index = 0; index < parts; index++) {
    if (!completed.has(index)) {
      const chunk = asset.file.slice(index * CHUNK_BYTES, Math.min(asset.file.size, (index + 1) * CHUNK_BYTES));
      await lanRequest(route + "?part=" + index, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
      });
    }
    onProgress?.((index + 1) / parts);
  }
  await lanRequest(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: asset.name, type: asset.type, mimeType: asset.file.type, size: asset.file.size, parts }),
  });
  onProgress?.(1);
}

/** Download a host-generated, low-bandwidth editing copy; never upload it as the original. */
export async function downloadRemotePreviewAsset(projectId: string, asset: RemoteAsset): Promise<File> {
  const response = await lanRequest(
    "projects/" + encodeURIComponent(projectId) + "/assets/" + encodeURIComponent(asset.id) + "?preview=1",
  );
  const blob = await response.blob();
  const mimeType = response.headers.get("content-type") || blob.type;
  const extension = asset.type === "video" ? ".mp4" : asset.type === "audio" ? ".m4a" : ".png";
  return new File([blob], asset.id + "-preview" + extension, {
    type: mimeType, lastModified: Date.now(),
  });
}

export async function downloadRemoteAsset(projectId: string, asset: RemoteAsset): Promise<File> {
  const response = await lanRequest("projects/" + encodeURIComponent(projectId) + "/assets/" + encodeURIComponent(asset.id) + "?download=1");
  const blob = await response.blob();
  return new File([blob], asset.name, { type: asset.mimeType || blob.type, lastModified: Date.now() });
}
