// Generated from src/events/syncTransitions.ts. Run npm run generate:runtime.
import { type EventCommitPlan } from "../eventCommands.js";
import type { EventPrizeAssignmentRecord } from "../eventReads.js";
import type { EventBracketRuntime } from "./bracket.js";
import type { EventData } from "./model.js";
import type { EventOwnershipSnapshot } from "./ownership.js";
type EventSyncPlanInput = {
  eventId: string;
  event: EventData;
  nowMs: number;
  ownershipSnapshot: EventOwnershipSnapshot | null;
  prizeSelections?: Record<string, string> | null;
};
type EventSyncPlan = {
  updates: EventCommitPlan;
  didChange: boolean;
  eventForProjection: EventData;
  prizeAssignmentsForProjection: Record<
    string,
    EventPrizeAssignmentRecord
  > | null;
};
type EventSyncPlanningDependencies = Pick<
  EventBracketRuntime,
  | "addEventPrizeAssignmentUpdates"
  | "applyMatchResolution"
  | "getSortedRoundIndexes"
  | "hasThirdPlaceMatchField"
  | "isMatchResolved"
  | "rebuildParticipantStatesFromRounds"
  | "recomputeRoundStatuses"
  | "reconcileBracketMatchReadiness"
  | "reconcileThirdPlaceMatchReadiness"
  | "resolveEventPrizeAssignments"
  | "resolveRoundMatchState"
  | "resolveRoundMatchesWithConcurrency"
>;
export declare function buildActiveEventSyncPlan(
  {
    eventId,
    event,
    nowMs,
    ownershipSnapshot,
    prizeSelections,
  }: EventSyncPlanInput,
  dependencies: EventSyncPlanningDependencies,
): Promise<EventSyncPlan>;
export declare function buildEndedEventSyncPlan(
  {
    eventId,
    event,
    nowMs,
    ownershipSnapshot,
    prizeSelections,
  }: EventSyncPlanInput,
  dependencies: EventSyncPlanningDependencies,
): Promise<EventSyncPlan>;
export {};
