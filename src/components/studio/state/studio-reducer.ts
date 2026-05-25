import type { StudioState } from "./studio-state";

type StudioSetAction = {
  type: "set";
  key: keyof StudioState;
  value: StudioState[keyof StudioState] | ((previous: never) => StudioState[keyof StudioState]);
};

export type StudioAction = StudioSetAction | { type: "patch"; values: Partial<StudioState> };

function resolveStateValue<K extends keyof StudioState>(state: StudioState, key: K, value: StudioSetAction["value"]) {
  const previous = state[key];
  return typeof value === "function"
    ? (value as (current: StudioState[K]) => StudioState[K])(previous)
    : value;
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "set":
      return {
        ...state,
        [action.key]: resolveStateValue(state, action.key, action.value)
      };
    case "patch":
      return {
        ...state,
        ...action.values
      };
    default:
      return state;
  }
}
