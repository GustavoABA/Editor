"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIONS, isActionWithOptionalArgs } from "@/actions/definitions";
import type { TActionWithOptionalArgs } from "@/actions";
import { isShortcutKey, type ShortcutKey } from "@/actions/keybinding";
import { useKeybindingsStore } from "@/actions/keybindings-store";

const CATEGORY_LABELS: Record<string, string> = {
  playback: "Reprodução", navigation: "Navegação", editing: "Edição",
  selection: "Seleção", history: "Histórico", timeline: "Timeline",
  controls: "Controles", assets: "Biblioteca",
};

export function ShortcutSettings() {
  const { keybindings, updateKeybinding, removeKeybinding, resetToDefaults,
    setIsRecording, validateKeybinding } = useKeybindingsStore();
  const [recordAction, setRecordAction] = useState<TActionWithOptionalArgs | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!recordAction) return;
    setIsRecording(true);
    const capture = (event: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecordAction(null);
        return;
      }
      const next = useKeybindingsStore.getState().getKeybindingString(event);
      if (!next || !isShortcutKey(next)) {
        setMessage("Combinação não suportada. Use letras, números, setas ou modificadores.");
        return;
      }
      const conflict = validateKeybinding({ key: next, action: recordAction });
      if (conflict && !window.confirm(
        `A combinação ${next.toUpperCase()} já executa "${ACTIONS[conflict.existingAction]?.description || conflict.existingAction}". Substituir esse atalho?`,
      )) return;
      const existing = useKeybindingsStore.getState().getKeybindingsForAction(recordAction);
      // One primary shortcut per action; custom shortcuts of all other actions remain.
      for (const key of existing) removeKeybinding(key);
      updateKeybinding({ key: next as ShortcutKey, action: recordAction });
      setMessage(`Atalho atualizado: ${ACTIONS[recordAction]?.description || recordAction} = ${next.toUpperCase()}`);
      setRecordAction(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => {
      window.removeEventListener("keydown", capture, true);
      setIsRecording(false);
    };
  }, [recordAction, removeKeybinding, setIsRecording, updateKeybinding, validateKeybinding]);

  const available = useMemo(
    () => Object.entries(ACTIONS).filter(([name, action]) =>
      isActionWithOptionalArgs(name) && (
      name.toLowerCase().includes(search.toLowerCase()) ||
      action.description.toLowerCase().includes(search.toLowerCase()) ||
      (CATEGORY_LABELS[action.category] || action.category).toLowerCase().includes(search.toLowerCase())),
    ),
    [search],
  );

  const shortcutsFor = (action: TActionWithOptionalArgs) =>
    [...keybindings.entries()].filter(([, value]) => value === action).map(([key]) => key);

  return (
    <section className="flex min-h-0 flex-col gap-2 p-3" aria-label="Configurar atalhos de teclado">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Atalhos de teclado</h3>
          <p className="text-muted-foreground text-xs">Clique em Alterar e pressione a nova combinação. Esc cancela. As alterações são salvas automaticamente neste navegador.</p>
        </div>
        <button type="button" className="rounded border px-2 py-1 text-xs"
          onClick={() => {
            if (!window.confirm("Restaurar todos os atalhos padrão e descartar personalizações?")) return;
            resetToDefaults();
            setMessage("Atalhos padrão restaurados.");
          }}>Restaurar padrões</button>
      </div>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar ação, atalho ou categoria…" aria-label="Buscar atalhos"
        className="bg-background w-full rounded border px-2 py-1.5 text-xs" />
      {message && <p role="status" className="text-muted-foreground text-xs">{message}</p>}
      <div className="flex min-h-0 flex-col gap-1">
        {available.map(([action, definition]) => {
          const typedAction = action as TActionWithOptionalArgs;
          const keys = shortcutsFor(typedAction);
          const recording = recordAction === typedAction;
          return (
            <div key={action} className="flex items-center gap-2 rounded border px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{definition.description}</div>
                <div className="text-muted-foreground text-[10px]">
                  {CATEGORY_LABELS[definition.category] || definition.category}
                </div>
              </div>
              <kbd className="shrink-0 rounded bg-muted px-2 py-1 text-[11px]">
                {recording ? "Pressione…" : keys.map(key => key.toUpperCase()).join(" / ") || "Sem atalho"}
              </kbd>
              <button type="button" className="rounded border px-2 py-1 text-xs"
                aria-label={`Alterar atalho de ${definition.description}`}
                onClick={() => { setMessage(""); setRecordAction(recording ? null : typedAction); }}>
                {recording ? "Cancelar" : "Alterar"}
              </button>
              {!!keys.length && <button type="button" className="text-muted-foreground px-1 text-xs underline"
                aria-label={`Remover atalho de ${definition.description}`}
                onClick={() => keys.forEach(removeKeybinding)}>Limpar</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
