import { RenderStatus } from "./render-status";

export default async function RenderStatusPage({
	params,
}: {
	params: Promise<{ jobId: string }>;
}) {
	const { jobId } = await params;
	return <RenderStatus jobId={jobId} />;
}
