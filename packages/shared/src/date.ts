/** 将更新时间统一显示为北京时间文本；只有日期时不补出虚假的时间。 */
export function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return "尚未保存";

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00+08:00` : value);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(dateOnly
      ? {}
      : {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23" as const,
        }),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const formattedDate = `${part("year")}年${part("month")}月${part("day")}日`;

  return dateOnly
    ? formattedDate
    : `${formattedDate} ${part("hour")}:${part("minute")}:${part("second")}`;
}
