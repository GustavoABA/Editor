import { readFile } from "node:fs/promises";

const WEBHOOK_PATH_PATTERN =
	/^\/webhook(?:-test)?\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/;

export function validateN8nWebhookPath(value: unknown): string | null {
	if (
		typeof value !== "string" ||
		value.length > 500 ||
		value.includes("..") ||
		!WEBHOOK_PATH_PATTERN.test(value)
	) {
		return null;
	}
	return value;
}

export async function deliverRenderToN8n({
	webhookPath,
	filePath,
	fileName,
	jobId,
	clientOrigin,
}: {
	webhookPath: string;
	filePath: string;
	fileName: string;
	jobId: string;
	clientOrigin?: string;
}): Promise<void> {
	const validPath = validateN8nWebhookPath(webhookPath);
	if (!validPath) throw new Error("Invalid n8n webhook path");
	const baseUrl = process.env.N8N_BASE_URL;
	if (!baseUrl) throw new Error("n8n is not configured on the OpenCut server");
	const target = new URL(validPath, `${baseUrl.replace(/\/$/, "")}/`);
	const bytes = await readFile(filePath);
	const isMp4 = fileName.toLowerCase().endsWith(".mp4");
	const formData = new FormData();
	formData.append(
		"video",
		new File([bytes], fileName, { type: isMp4 ? "video/mp4" : "video/webm" }),
	);
	formData.append("jobId", jobId);
	if (clientOrigin) {
		formData.append(
			"downloadUrl",
			`${clientOrigin.replace(/\/$/, "")}/api/server-render/jobs/${jobId}/download`,
		);
	}
	const response = await fetch(target, {
		method: "POST",
		headers: {
			...(process.env.N8N_WEBHOOK_TOKEN
				? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_TOKEN}` }
				: {}),
		},
		body: formData,
		signal: AbortSignal.timeout(2 * 60 * 1000),
	});
	if (!response.ok) {
		throw new Error(`n8n webhook returned status ${response.status}`);
	}
}
