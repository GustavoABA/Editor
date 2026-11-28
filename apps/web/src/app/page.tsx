import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SITE_URL } from "@/site/brand";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = { title: "Cut Editor", alternates: { canonical: SITE_URL } };

export default function Home() {
	return (
		<div>
			<Header />
			<main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-8 px-6 py-20 text-center">
				<p className="text-muted-foreground text-sm uppercase tracking-widest">Editor independente • código aberto</p>
				<h1 className="text-5xl font-bold tracking-tight md:text-7xl">Cut Editor</h1>
				<p className="max-w-xl text-muted-foreground text-lg">Editor de vídeo auto-hospedado para editar no navegador, trabalhar em rede local e automatizar tarefas com IA e HyperFrames.</p>
				<a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground">Ver nosso GitHub</a>
				<section className="flex max-w-xl flex-col items-center gap-3 rounded-xl border p-6">
					<Image src="/maintainer.svg" alt="Espaço para foto de Gustavo" width={100} height={100} className="rounded-full object-cover" unoptimized />
					<h2 className="text-xl font-semibold">Gustavo</h2>
					<p className="text-sm text-muted-foreground">Responsável pela evolução independente do Cut Editor. Este projeto deriva do OpenCut, com funcionalidades e planejamento próprios. Os créditos e a licença MIT do projeto original são preservados.</p>
					<Link href="/contributors" className="text-sm underline">Ver contribuidores</Link>
				</section>
				<p className="text-sm text-muted-foreground">As funcionalidades em desenvolvimento e os testes pendentes estão no <Link href="/roadmap" className="underline">roadmap oficial</Link>.</p>
			</main>
			<Footer />
		</div>
	);
}
