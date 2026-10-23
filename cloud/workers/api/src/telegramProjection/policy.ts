import { PROJECTION_RECOVERY_PAGE_SIZE } from "../projectionRecoveryPages.ts";

export {
  infrastructureRetryDelaySeconds as projectionRetryDelaySeconds,
  MAX_INFRASTRUCTURE_RETRY_DELAY_SECONDS as MAX_PROJECTION_RETRY_DELAY_SECONDS,
} from "../queueRetry.ts";

export const PROJECTION_SWEEP_LIMIT = PROJECTION_RECOVERY_PAGE_SIZE;
export const PROJECTION_INPUT_RETRIES = 5;
