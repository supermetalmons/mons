// Generated from src/eventPrizes/assignmentValidation.ts. Run npm run generate:runtime.
import type { WithdrawalData } from "./types.js";
declare const validatePrizeAssignment: ({
  assignment,
  eventId,
  prizeId,
  profileId,
}: {
  assignment: WithdrawalData | null | undefined;
  eventId: string;
  prizeId: string;
  profileId: string;
}) => number;
export { validatePrizeAssignment };
