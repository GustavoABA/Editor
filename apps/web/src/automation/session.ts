"use client";

import { generateUUID } from "@/utils/id";

const AUTOMATION_SESSION_KEY = "opencut-automation-session";

export function getAutomationSessionId(): string {
	const existing = sessionStorage.getItem(AUTOMATION_SESSION_KEY);
	if (existing) return existing;
	const sessionId = generateUUID();
	sessionStorage.setItem(AUTOMATION_SESSION_KEY, sessionId);
	return sessionId;
}
