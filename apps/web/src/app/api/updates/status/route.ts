import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { authorizeSync } from "@/lan-sync/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import { listAutomationSessions } from "@/server-automation/store";
import { getJobsRoot, readJob } from "@/server-render/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const root = process.env.UPDATE_STATUS_DIR || "/app/update-status";
const validCommit = (v: unknown) => typeof v === "string" && /^(?:[a-f0-9]{40}|local-baseline)$/.test(v) ? v : null;

async function observation() {
  // An observation is never an exclusive maintenance lease. Stale/offline
  // clients and unsynchronized work cannot be inferred from heartbeat alone.
  try {
    const sessions = await listAutomationSessions();
    const recent = sessions.filter(s => {
      const age = Date.now() - Date.parse(s.lastSeen);
      return !Number.isFinite(age) || age < 120_000;
    }).length;
    const dirs = await readdir(getJobsRoot(), {withFileTypes:true});
    let renders = 0;
    let unknown = false;
    for (const dir of dirs.filter(d => d.isDirectory() && /^[a-f0-9-]{36}$/i.test(d.name))) {
      const job = await readJob({jobId:dir.name});
      if (!job) { unknown = true; continue; }
      if (job.status === "queued" || job.status === "rendering") renders++;
    }
    return { recentSessions: recent, activeRenders: renders, state: unknown ? "unknown" : recent || renders ? "busy" : "no-observed-activity", safeToInstall:false };
  } catch {
    return {recentSessions:null, activeRenders:null, state:"unknown", safeToInstall:false};
  }
}

export async function GET(request: Request) {
  const denied = authorizeSync(request);
  if (denied && !authorizeAutomationRequest({request}).ok) return denied;
  let status = null;
  try {
    const file = path.join(root,"status.json");
    if ((await stat(file)).size > 16_384) throw Error("status too large");
    const raw = JSON.parse(await readFile(file,"utf8"));
    if (raw.schema !== 1) throw Error("invalid status");
    const checked = raw.monitor || {};
    const states = ["no-public-stable-release","no-stable-manifest","stable-manifest-discovered-unverified","check-failed","not-checked"];
    status = {
      activeCommit:validCommit(raw.activeCommit), stagedCommit:validCommit(raw.stagedCommit),
      recoveryRequired:raw.recoveryRequired === true,
      profile:raw.profile === "lite" || raw.profile === "full" ? raw.profile : null,
      monitor:{status:states.includes(checked.status) ? checked.status : "not-checked",
        commit:validCommit(checked.commit), checkedAt:typeof checked.checkedAt === "string" ? checked.checkedAt.slice(0,40) : ""},
      exportedAt:typeof raw.exportedAt === "string" ? raw.exportedAt.slice(0,40) : "",
    };
  } catch { /* host exporter is optional until configured */ }
  return Response.json({status,activity:await observation(),autoInstall:false},{headers});
}
