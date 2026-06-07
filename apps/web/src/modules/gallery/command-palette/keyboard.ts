export interface CommandKeyboardState {
  selectedIndex: number;
  resultCount: number;
}

export type CommandKeyboardIntent =
  | { type: "move"; selectedIndex: number }
  | { type: "execute"; selectedIndex: number }
  | { type: "none" };

export function resolveCommandKeyboardIntent(
  key: string,
  state: CommandKeyboardState,
): CommandKeyboardIntent {
  if (state.resultCount <= 0) {
    return { type: "none" };
  }

  if (key === "ArrowDown") {
    return {
      type: "move",
      selectedIndex: Math.min(state.selectedIndex + 1, state.resultCount - 1),
    };
  }

  if (key === "ArrowUp") {
    return {
      type: "move",
      selectedIndex: Math.max(state.selectedIndex - 1, 0),
    };
  }

  if (key === "Enter") {
    return {
      type: "execute",
      selectedIndex: state.selectedIndex,
    };
  }

  return { type: "none" };
}
