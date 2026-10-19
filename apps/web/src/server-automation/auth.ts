import { timingSafeEqual } from "node:crypto";

function tokensMatch({
	left,
	right,
}: {
	left: string;
	right: string;
}): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return (
		leftBuffer.length === rightBuffer.length &&
		timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function isSameOriginBrowserRequest(request: Request): boolean {
	const requestUrl = new URL(request.url);
	const origin = request.headers.get("origin");
	if (origin === requestUrl.origin) return true;
	return request.headers.get("sec-fetch-site") === "same-origin";
}

export function authorizeAutomationRequest({
	request,
	allowSameOrigin = false,
}: {
	request: Request;
	allowSameOrigin?: boolean;
}): { ok: true } | { ok: false; status: number; error: string } {
	if (allowSameOrigin && isSameOriginBrowserRequest(request)) {
		return { ok: true };
	}

	const expectedToken = process.env.OPENCUT_AUTOMATION_TOKEN;
	if (!expectedToken) {
		return {
			ok: false,
			status: 503,
			error: "Automation access is not configured on this server",
		};
	}
	const authorization = request.headers.get("authorization") ?? "";
	const suppliedToken = authorization.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: "";
	if (
		!suppliedToken ||
		!tokensMatch({ left: suppliedToken, right: expectedToken })
	) {
		return { ok: false, status: 401, error: "Invalid automation token" };
	}
	return { ok: true };
}
