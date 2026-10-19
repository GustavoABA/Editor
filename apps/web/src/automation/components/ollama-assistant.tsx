"use client";

import { useState } from "react";
import { Bot, CheckCircle2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getAutomationSessionId } from "@/automation/session";

type PlannedCommand = {
	type: string;
	payload: Record<string, unknown>;
};

type EditingPlan = {
	model: string;
	summary: string;
	commands: PlannedCommand[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePlan(value: unknown): EditingPlan | null {
	if (
		!isRecord(value) ||
		typeof value.model !== "string" ||
		typeof value.summary !== "string" ||
		!Array.isArray(value.commands)
	) {
		return null;
	}
	const commands = value.commands.flatMap((command) =>
		isRecord(command) &&
		typeof command.type === "string" &&
		isRecord(command.payload)
			? [{ type: command.type, payload: command.payload }]
			: [],
	);
	return { model: value.model, summary: value.summary, commands };
}

function commandLabel(command: PlannedCommand): string {
	switch (command.type) {
		case "auto_cut":
			return `Auto Cut (${String(command.payload.preset)})`;
		case "set_caption_style":
			return `Legendas ${String(command.payload.placement)} · ${String(command.payload.preset)}`;
		case "split_at":
			return `Dividir em ${Number(command.payload.seconds).toFixed(2)} s`;
		case "delete_elements":
			return `Remover ${Array.isArray(command.payload.elements) ? command.payload.elements.length : 0} item(ns)`;
		case "update_text":
			return `Alterar texto para “${String(command.payload.content).slice(0, 40)}”`;
		case "undo":
			return "Desfazer a última alteração";
		case "redo":
			return "Refazer a última alteração";
		default:
			return command.type;
	}
}

async function enqueueAndWait({
	sessionId,
	command,
}: {
	sessionId: string;
	command: PlannedCommand;
}): Promise<void> {
	const createResponse = await fetch("/api/automation/commands", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, ...command }),
	});
	const created: unknown = await createResponse.json().catch(() => null);
	if (
		!createResponse.ok ||
		!isRecord(created) ||
		!isRecord(created.command) ||
		typeof created.command.id !== "string"
	) {
		throw new Error("Não foi possível enviar a ação ao editor");
	}
	const commandId = created.command.id;
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 500));
		const response = await fetch(`/api/automation/commands/${commandId}`, {
			cache: "no-store",
		});
		const body: unknown = await response.json().catch(() => null);
		if (!response.ok || !isRecord(body) || !isRecord(body.command)) continue;
		if (body.command.status === "complete") return;
		if (body.command.status === "failed") {
			throw new Error(
				typeof body.command.error === "string"
					? body.command.error
					: "Uma ação do plano falhou",
			);
		}
	}
	throw new Error("O editor demorou demais para aplicar o plano");
}

export function OllamaAssistant() {
	const [instruction, setInstruction] = useState("");
	const [plan, setPlan] = useState<EditingPlan | null>(null);
	const [isPlanning, setIsPlanning] = useState(false);
	const [isApplying, setIsApplying] = useState(false);

	const createPlan = async () => {
		if (instruction.trim().length < 3) return;
		setIsPlanning(true);
		setPlan(null);
		try {
			const response = await fetch("/api/automation/ollama/plan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId: getAutomationSessionId(),
					instruction: instruction.trim(),
				}),
			});
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(
					isRecord(body) && typeof body.error === "string"
						? body.error
						: "O Ollama não conseguiu criar um plano",
				);
			}
			const parsed = parsePlan(body);
			if (!parsed) throw new Error("O Ollama devolveu um plano inválido");
			setPlan(parsed);
		} catch (error) {
			toast.error("Falha ao planejar a edição", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsPlanning(false);
		}
	};

	const applyPlan = async () => {
		if (!plan || plan.commands.length === 0) return;
		setIsApplying(true);
		try {
			const sessionId = getAutomationSessionId();
			for (const command of plan.commands) {
				await enqueueAndWait({ sessionId, command });
			}
			toast.success("Plano do Ollama aplicado", {
				description: `${plan.commands.length} ação(ões). Use Ctrl+Z para desfazer.`,
			});
			setPlan(null);
		} catch (error) {
			toast.error("Falha ao aplicar o plano", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsApplying(false);
		}
	};

	return (
		<section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
			<div className="flex items-start gap-2">
				<div className="rounded-md bg-primary/10 p-2 text-primary">
					<Bot className="size-4" />
				</div>
				<div>
					<h3 className="text-sm font-medium">Assistente Ollama</h3>
					<p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
						Descreva a edição. O modelo local prepara um plano para você revisar.
					</p>
				</div>
			</div>
			<Textarea
				aria-label="Pedido para o Ollama"
				placeholder="Ex.: remova pausas e deixe as legendas sociais embaixo"
				value={instruction}
				onChange={(event) => {
					setInstruction(event.target.value);
					setPlan(null);
				}}
				disabled={isPlanning || isApplying}
				maxLength={2_000}
			/>
			<Button
				type="button"
				variant="outline"
				className="w-full gap-2"
				onClick={() => void createPlan()}
				disabled={instruction.trim().length < 3 || isPlanning || isApplying}
			>
				{isPlanning ? <Spinner /> : <Sparkles className="size-4" />}
				{isPlanning ? "Ollama está planejando…" : "Criar plano de edição"}
			</Button>

			{plan && (
				<div className="space-y-3 rounded-md border bg-background p-3">
					<div className="flex items-start gap-2">
						<CheckCircle2 className="text-constructive mt-0.5 size-4 shrink-0" />
						<div>
							<p className="text-xs font-medium">Plano pronto</p>
							<p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
								{plan.summary}
							</p>
						</div>
					</div>
					{plan.commands.length > 0 ? (
						<ol className="space-y-1.5">
							{plan.commands.map((command, index) => (
								<li
									key={`${command.type}-${index}`}
									className="flex gap-2 rounded bg-muted/60 px-2 py-1.5 text-[11px]"
								>
									<span className="text-muted-foreground tabular-nums">
										{index + 1}.
									</span>
									<span>{commandLabel(command)}</span>
								</li>
							))}
						</ol>
					) : (
						<p className="text-muted-foreground text-xs">
							Nenhuma alteração foi necessária.
						</p>
					)}
					<Button
						type="button"
						className="w-full gap-2"
						onClick={() => void applyPlan()}
						disabled={plan.commands.length === 0 || isApplying}
					>
						{isApplying ? <Spinner /> : <Play className="size-4" />}
						{isApplying ? "Aplicando…" : "Aplicar plano"}
					</Button>
					<p className="text-muted-foreground text-center text-[10px]">
						Modelo local: {plan.model}
					</p>
				</div>
			)}
		</section>
	);
}
