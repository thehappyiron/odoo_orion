import type { Frequency } from "@/lib/types";
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function date(value: string) {
  return new Date(`${value}T12:00:00Z`);
}
export function addDays(value: string, days: number): string {
  const d = date(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function cycleEnd(
  start: string,
  frequency: Frequency,
  anchorDay: number,
  anchorMonth?: number,
): string {
  if (frequency === "DAILY") return addDays(start, 1);
  if (frequency === "WEEKLY") return addDays(start, 7);
  const d = date(start);
  const year = d.getUTCFullYear() + (frequency === "YEARLY" ? 1 : 0);
  const month =
    frequency === "YEARLY"
      ? (anchorMonth ?? d.getUTCMonth() + 1) - 1
      : d.getUTCMonth() + 1;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, maxDay), 12))
    .toISOString()
    .slice(0, 10);
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date(value).valueOf()) &&
    date(value).toISOString().slice(0, 10) === value
  );
}
