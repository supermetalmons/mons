export const primaryActionTypes = {
  None: "none",
  JoinGame: "joinGame",
  Rematch: "rematch",
} as const;

export const PrimaryActionType = primaryActionTypes;
export type PrimaryAction =
  (typeof primaryActionTypes)[keyof typeof primaryActionTypes];
