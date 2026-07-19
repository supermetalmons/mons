export type NavigationStatus =
  "pending" | "waiting" | "active" | "ended" | "dismissed";

export interface NavigationOrderingItem {
  id: string;
  status: NavigationStatus;
  sortBucket: number;
  listSortAtMs: number;
}

export type AutomatchStateHint = "pending" | "matched" | "canceled";

export interface AutomatchStateHintInput {
  inviteId: string;
  queueValue?: unknown;
  hasGuest: boolean;
  storedStateHint?: unknown;
}

export const NAVIGATION_SORT_BUCKETS: Readonly<
  Record<NavigationStatus, 20 | 30 | 40 | 50>
>;
export function normalizeAutomatchStateHint(
  value: unknown,
): AutomatchStateHint | null;
export function normalizeStrictAutomatchStateHint(
  value: unknown,
): AutomatchStateHint | null;
export function inferAutomatchStateHint(
  input: AutomatchStateHintInput,
): AutomatchStateHint | null;
export function getNavigationStatusPriority(status: NavigationStatus): number;
export function getNavigationSortBucket(
  status: NavigationStatus,
): 20 | 30 | 40 | 50;
export function compareNavigationItems<T extends NavigationOrderingItem>(
  left: T,
  right: T,
): number;
