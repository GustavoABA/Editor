import { ServerRenderRunner } from "./server-render-runner";

export default async function ServerRenderPage({ params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = await params;
	return <ServerRenderRunner jobId={jobId} />;
}
