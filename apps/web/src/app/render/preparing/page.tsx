export default function PreparingRenderPage() {
	return (
		<main className="grid min-h-screen place-items-center bg-[#0b0b0d] px-6 text-white">
			<div className="w-full max-w-md text-center">
				<div className="mx-auto mb-5 size-12 animate-pulse rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/40" />
				<h1 className="text-2xl font-semibold">Enviando projeto ao servidor</h1>
				<p className="mt-2 text-sm text-white/60">
					Mantenha esta aba aberta. O progresso da renderização aparecerá aqui.
				</p>
			</div>
		</main>
	);
}
