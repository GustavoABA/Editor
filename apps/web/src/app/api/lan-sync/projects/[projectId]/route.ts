import { authorizeSync, readProject, saveProject, isRecord, getAssetRecord } from "@/lan-sync/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const project = await readProject(projectId);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    const assets = await Promise.all(project.assets.map(async (asset) => ({
      ...asset, uploaded: Boolean(await getAssetRecord(projectId, asset.id)),
    })));
    return Response.json({ ...project, assets });
  } catch {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const raw: unknown = await request.json();
    if (!isRecord(raw)) return Response.json({ error: "Invalid body" }, { status: 400 });
    const saved = await saveProject({
      projectId,
      baseRevision: raw.baseRevision as number,
      document: raw.document,
      assets: raw.assets,
    });
    return Response.json({ revision: saved.revision, updatedAt: saved.updatedAt, checkpointAt: saved.checkpointAt });
  } catch (error) {
    const conflict = error instanceof Error && error.name === "RevisionConflict";
    return Response.json({ error: conflict ? "Remote revision conflict: reload the latest version before saving" : error instanceof Error ? error.message : "Cannot save project" }, { status: conflict ? 409 : 400 });
  }
}
