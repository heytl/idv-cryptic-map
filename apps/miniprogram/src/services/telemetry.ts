import { createVisitTracker } from "@idv-map/shared";
import { apiOrigin } from "./content";

// Event IDs provide deduplication only, never authentication.
function eventId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 3) | 8).toString(16);
  });
}

export function createMiniProgramVisitTracker() {
  return createVisitTracker(event => {
    // Native WeChat supplies Referer. Never fabricate browser Origin.
    uni.request({
      url: `${apiOrigin}/telemetry/events`, method: "POST", timeout: 5000,
      header: { "Content-Type": "application/json" }, data: event,
      // Analytics are best effort; failed/offline visits are not replayed.
      fail: () => {},
    });
  }, eventId);
}
