import { getPersistedKeybindingsState } from "../persisted-state";

/** Upgrade only untouched default shortcuts; preserve any user-customized mapping. */
export function v7ToV8({ state }: { state: unknown }): unknown {
  const persisted = getPersistedKeybindingsState({ state });
  if (!persisted || persisted.isCustomized) return state;
  const keybindings = { ...persisted.keybindings };
  if (keybindings.s === "split") delete keybindings.s;
  if (keybindings.q === "split-left") delete keybindings.q;
  if (keybindings.w === "split-right") delete keybindings.w;
  if (!keybindings.c) keybindings.c = "split";
  if (!keybindings.v) keybindings.v = "split-left";
  if (!keybindings.x) keybindings.x = "split-right";
  return { ...persisted, keybindings };
}
