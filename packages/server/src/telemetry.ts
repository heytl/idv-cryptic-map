import {
  ENABLED_ENTRANCES,
  type MapConfigV3,
  type VisitEvent,
} from "../../shared/src/index";
import { ServiceError } from "./content";
export function makeVisit(
  input: unknown,
  config: MapConfigV3,
  now = new Date(),
): VisitEvent {
  const e = input as Partial<VisitEvent> | null;
  if (
    !e ||
    typeof e.eventId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      e.eventId,
    ) ||
    !Number.isInteger(e.layoutId) ||
    typeof e.entranceId !== "string"
  )
    throw new ServiceError(400, "invalid_event");
  const layout = config.layouts.find(
    (l) => l.id === e.layoutId && l.published && !l.deletedAt,
  );
  const entrance = layout?.entrances.find(
    (en) =>
      en.id === e.entranceId &&
      ENABLED_ENTRANCES[layout.mode].includes(en.type),
  );
  if (
    !layout ||
    !entrance ||
    !config.gameMaps.some(
      (m) => m.id === layout.gameMapId && m.published && !m.deletedAt,
    )
  )
    throw new ServiceError(400, "invalid_layout");
  return {
    eventId: e.eventId,
    layoutId: layout.id,
    entranceId: entrance.id,
    entranceType: entrance.type,
    gameMapId: layout.gameMapId,
    mode: layout.mode,
    receivedAt: now.toISOString(),
  };
}
