// Generated from src/eventPrizes/assignmentValidation.ts. Run npm run generate:runtime.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePrizeAssignment = void 0;
const errors_js_1 = require("./errors.js");
const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const validatePrizeAssignment = ({
  assignment,
  eventId,
  prizeId,
  profileId,
}) => {
  const place = Number(assignment?.place);
  if (
    !assignment ||
    normalizeString(assignment.eventId) !== eventId ||
    normalizeString(assignment.prizeId) !== prizeId ||
    normalizeString(assignment.profileId) !== profileId ||
    ![1, 2, 3].includes(place)
  ) {
    throw new errors_js_1.EventPrizeWithdrawalError(
      "not-found",
      "Event prize not found.",
    );
  }
  return place;
};
exports.validatePrizeAssignment = validatePrizeAssignment;
