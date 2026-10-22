/** A route visit, not a floor/entrance change. Leaving detail resets the visit. */
export function createVisitTracker(
  send: (event: {
    eventId: string;
    layoutId: number;
    entranceId: string;
  }) => void,
  uuid: () => string,
) {
  let current: {
    key: string;
    layoutId: number;
    entranceId: string;
    sent: boolean;
  } | null = null;
  return {
    navigate(
      next: { gameMapId: string; layoutId: number; entranceId: string } | null,
      visible: boolean,
      online: boolean,
    ) {
      const key = next ? `${next.gameMapId}/${next.layoutId}` : "";
      if (!next) {
        current = null;
        return;
      }
      if (current?.key !== key)
        current = {
          key,
          layoutId: next.layoutId,
          entranceId: next.entranceId,
          sent: false,
        };
      if (visible && !current.sent) {
        current.sent = true; // Offline visits are deliberately not replayed.
        if (online)
          send({
            eventId: uuid(),
            layoutId: current.layoutId,
            entranceId: current.entranceId,
          });
      }
    },
  };
}
