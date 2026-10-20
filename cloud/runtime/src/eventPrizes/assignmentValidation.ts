import type { WithdrawalData } from "./types.js";
import { EventPrizeWithdrawalError as HttpsError } from "./errors.js";

const normalizeString = (value: unknown): string =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";

const validatePrizeAssignment = ({
  assignment,
  eventId,
  prizeId,
  profileId,
}: {
  assignment: WithdrawalData | null | undefined;
  eventId: string;
  prizeId: string;
  profileId: string;
}): number => {
  const place = Number(assignment?.place);
  if (
    !assignment ||
    normalizeString(assignment.eventId) !== eventId ||
    normalizeString(assignment.prizeId) !== prizeId ||
    normalizeString(assignment.profileId) !== profileId ||
    ![1, 2, 3].includes(place)
  ) {
    throw new HttpsError("not-found", "Event prize not found.");
  }
  return place;
};

export { validatePrizeAssignment };
