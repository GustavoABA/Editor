import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IntegrationStore {
	n8nWebhookPath: string;
	setN8nWebhookPath: (path: string) => void;
	sendExportsToN8n: boolean;
	setSendExportsToN8n: (enabled: boolean) => void;
}

export const useIntegrationStore = create<IntegrationStore>()(
	persist(
		(set) => ({
			n8nWebhookPath: "",
			setN8nWebhookPath: (path) => set({ n8nWebhookPath: path }),
			sendExportsToN8n: false,
			setSendExportsToN8n: (enabled) => set({ sendExportsToN8n: enabled }),
		}),
		{ name: "opencut-integrations" },
	),
);

export function isN8nWebhookPathValid(path: string): boolean {
	return (
		(path.startsWith("/webhook/") || path.startsWith("/webhook-test/")) &&
		!path.includes("..") &&
		path.length <= 500
	);
}

