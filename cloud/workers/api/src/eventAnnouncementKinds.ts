import {
  EVENT_PRIZE_ANNOUNCEMENT_LEAD_MS,
  isEventPrizeAnnouncementEvent,
} from "../../../runtime/telegram/eventPrizeAnnouncement.js";
import {
  SUNDAY_MONS_REMINDER_LEAD_MS,
  isSundayMonsReminderEvent,
} from "../../../runtime/telegram/sundayMonsReminder.js";
import { isSafeRecordKey } from "./recordKeys.ts";

export const EVENT_ANNOUNCEMENT_KINDS = ["prizes", "reminder"] as const;
export type EventAnnouncementKind = (typeof EVENT_ANNOUNCEMENT_KINDS)[number];

export const EVENT_ANNOUNCEMENT_SPECS = {
  prizes: {
    reason: "event-prize-announcement",
    leadMs: EVENT_PRIZE_ANNOUNCEMENT_LEAD_MS,
    stepName: "prize announcement",
    isEligible: isEventPrizeAnnouncementEvent,
  },
  reminder: {
    reason: "sunday-mons-reminder",
    leadMs: SUNDAY_MONS_REMINDER_LEAD_MS,
    stepName: "sunday mons reminder",
    isEligible: isSundayMonsReminderEvent,
  },
} as const;

export function eventAnnouncementRunAtMs(
  eventId: string,
  event: unknown,
  nowMs: number,
  kind: EventAnnouncementKind,
): number | null {
  const spec = EVENT_ANNOUNCEMENT_SPECS[kind];
  if (!isSafeRecordKey(eventId) || !spec.isEligible(eventId, event))
    return null;
  const record =
    event && typeof event === "object" && !Array.isArray(event)
      ? (event as Record<string, unknown>)
      : null;
  const startAtMs = record?.startAtMs;
  if (typeof startAtMs !== "number") return null;
  const runAtMs = startAtMs - spec.leadMs;
  return runAtMs < 0 || nowMs > runAtMs ? null : runAtMs;
}

export function getEventAnnouncementKind(
  reason: unknown,
): EventAnnouncementKind | null {
  return (
    EVENT_ANNOUNCEMENT_KINDS.find(
      (kind) => EVENT_ANNOUNCEMENT_SPECS[kind].reason === reason,
    ) || null
  );
}
