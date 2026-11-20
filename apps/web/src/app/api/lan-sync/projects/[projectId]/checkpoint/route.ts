import { authorizeSync, checkpointProject } from "@/lan-sync/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId } = await params;
    const project = await checkpointProject(projectId);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ revision: project.revision, checkpointAt: project.checkpointAt });
  } catch {
    return Response.json({ error: "Could not create a checkpoint" }, { status: 400 });
  }
}
