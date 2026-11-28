import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BasePage } from "@/app/base-page";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = { title: "Roadmap - Cut Editor", description: "Planejamento oficial do repositório Cut Editor." };
export const dynamic = "force-static";

function readRoadmap(): string {
	for (const path of [resolve(process.cwd(), "features.md"), resolve(process.cwd(), "../../features.md")]) {
		try { return readFileSync(path, "utf8"); } catch { /* Try workspace root. */ }
	}
	throw new Error("features.md ausente: inclua o roadmap oficial no build.");
}

export default function RoadmapPage() {
	const roadmap = readRoadmap();
	return (
		<BasePage title="Roadmap" description="Conteúdo oficial de features.md, atualizado a cada build. Implementação não significa homologação.">
			<div className="mx-auto flex max-w-5xl flex-col gap-4">
				<a className="underline" href={SOCIAL_LINKS.github + "/blob/main/features.md"}>Arquivo oficial no GitHub</a>
				<pre className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-relaxed">{roadmap}</pre>
			</div>
		</BasePage>
	);
}
