import { authorizeSync, listProjects, syncEnabled } from "@/lan-sync/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    return Response.json({ enabled: syncEnabled(), projects: await listProjects() });
  } catch {
    return Response.json({ error: "Unable to list host projects" }, { status: 500 });
  }
}
