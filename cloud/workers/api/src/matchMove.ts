import {
  isSubmitMoveRequest,
  type SubmitMoveRequest,
  type SubmitMoveResponse,
} from "@mons/shared/game-sessions";
import { AuthApiFailure } from "./authErrors.ts";
import { enforceRateLimit } from "./rateLimit.ts";
import {
  authorizeMatchMutation,
  type MatchMutationAdmissionDependencies,
  type MatchMutationRepository,
} from "./matchMutationAdmission.ts";
import type { RequestIdentity } from "./requestIdentity.ts";

export type SubmitMoveDependencies = MatchMutationAdmissionDependencies & {
  submitCanonical: (request: SubmitMoveRequest) => Promise<SubmitMoveResponse>;
};

export async function enforceMatchMoveRateLimit(
  rateLimiter: RateLimit,
  uid: string,
): Promise<void> {
  return enforceRateLimit(
    rateLimiter,
    `match-move:${uid}`,
    "Too many move attempts.",
  );
}

export async function submitMove(
  identity: RequestIdentity,
  request: SubmitMoveRequest,
  repository: MatchMutationRepository,
  dependencies: SubmitMoveDependencies,
): Promise<SubmitMoveResponse> {
  if (!isSubmitMoveRequest(request)) {
    throw new AuthApiFailure(400, "invalid-argument", "invalid-request");
  }
  await authorizeMatchMutation(identity, request, repository, dependencies);
  return dependencies.submitCanonical(request);
}
