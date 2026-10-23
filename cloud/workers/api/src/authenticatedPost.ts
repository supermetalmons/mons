import {
  AuthApiFailure,
  authErrorResponse,
  isProfileWritesDisabledFailure,
} from "./authErrors.ts";
import { authPreflightResponse, getAuthCorsHeaders } from "./authHttp.ts";
import { summarizeError } from "./errorSummary.ts";
import type { RequestIdentity } from "./requestIdentity.ts";
import {
  verifySessionRequest,
  type WorkerExecutionContext,
} from "./sessionAuth.ts";

type AuthenticatedPostContext = {
  pathname: string;
  corsHeaders: Record<string, string>;
  authenticate: () => Promise<RequestIdentity>;
};

type AuthenticatedPostOptions = {
  failureMessage: string;
  failureEvent: string;
  logFailure?: (kind: string) => void;
  verifyIdentity?: (
    request: Request,
    env: Env,
    ctx: WorkerExecutionContext,
  ) => Promise<RequestIdentity>;
  errorResponse?: (
    error: unknown,
    corsHeaders: Record<string, string>,
  ) => Response | null;
};

export async function authenticatedPost(
  request: Request,
  env: Env,
  ctx: WorkerExecutionContext,
  options: AuthenticatedPostOptions,
  handle: (context: AuthenticatedPostContext) => Promise<Response>,
): Promise<Response> {
  let corsHeaders: Record<string, string> = { Vary: "Origin" };
  try {
    corsHeaders = getAuthCorsHeaders(request);
    if (request.method === "OPTIONS") {
      return authPreflightResponse(corsHeaders);
    }
    if (request.method !== "POST") {
      throw new AuthApiFailure(405, "method-not-allowed", "method-not-allowed");
    }
    return await handle({
      pathname: new URL(request.url).pathname,
      corsHeaders,
      authenticate: () =>
        (options.verifyIdentity || verifySessionRequest)(request, env, ctx),
    });
  } catch (error) {
    const response = options.errorResponse?.(error, corsHeaders);
    if (response) return response;
    const failure =
      error instanceof AuthApiFailure
        ? error
        : new AuthApiFailure(503, "unavailable", options.failureMessage);
    if (failure.status >= 500 && !isProfileWritesDisabledFailure(failure)) {
      (
        options.logFailure ||
        ((kind) =>
          console.error(
            JSON.stringify({
              event: options.failureEvent,
              kind,
              error: summarizeError(error),
            }),
          ))
      )(failure.message);
    }
    return authErrorResponse(failure, corsHeaders);
  }
}
