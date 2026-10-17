import type { CanonicalProfileConflict } from "./profileCanonical/types.ts";

export async function runConflictRetry<T>({
  maxAttempts,
  attempt,
  exhausted,
}: {
  maxAttempts: number;
  attempt: () => Promise<{ value: T } | { conflict: CanonicalProfileConflict }>;
  exhausted: (lastConflict: CanonicalProfileConflict | undefined) => Error;
}): Promise<T> {
  let lastConflict: CanonicalProfileConflict | undefined;
  for (let index = 0; index < maxAttempts; index++) {
    const result = await attempt();
    if ("value" in result) return result.value;
    lastConflict = result.conflict;
  }
  throw exhausted(lastConflict);
}
