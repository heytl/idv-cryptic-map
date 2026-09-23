export interface VisitEvent {
  eventId: string;
  layoutId: number;
  entranceId: string;
  entranceType: string;
  gameMapId: string;
  mode: string;
  receivedAt: string;
}
export interface StatsQuery {
  from: string;
  to: string;
  gameMapId?: string;
  mode?: string;
}
export interface StatRow {
  key: string;
  count: number;
  share: number;
  label?: string;
}
export interface StatsReport {
  query: StatsQuery;
  total: number;
  startedAt: string | null;
  daily: StatRow[];
  gameMaps: StatRow[];
  layouts: StatRow[];
  modes: StatRow[];
  entrances: StatRow[];
}
export function beijingDay(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
export function dayOffset(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400_000)
    .toISOString()
    .slice(0, 10);
}
export function validateStatsQuery(q: StatsQuery, now = new Date()): boolean {
  const validDay = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  const today = beijingDay(now);
  return (
    validDay(q.from) &&
    validDay(q.to) &&
    q.from <= q.to &&
    q.from >= dayOffset(today, -89) &&
    q.to <= today &&
    (!q.mode || ["hard", "nightmare"].includes(q.mode))
  );
}
