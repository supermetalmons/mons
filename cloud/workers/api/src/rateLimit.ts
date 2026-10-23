import { AuthApiFailure } from "./authErrors.ts";

export async function enforceRateLimit(
  binding: RateLimit,
  key: string,
  denialMessage: string,
): Promise<void> {
  let outcome: RateLimitOutcome;
  try {
    outcome = await binding.limit({ key });
  } catch {
    throw new AuthApiFailure(503, "unavailable", "rate-limit-unavailable");
  }
  if (!outcome.success) {
    throw new AuthApiFailure(429, "resource-exhausted", denialMessage);
  }
}
