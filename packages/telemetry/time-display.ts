export function resetText(resetAt: number | null, now: number, timeZone?: string): string | null {
  if (resetAt === null || !Number.isFinite(resetAt) || resetAt <= now || resetAt > 8_640_000_000_000_000) return null;
  const minutes = Math.ceil((resetAt - now) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const duration = days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  const local = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "numeric", timeZoneName: "short", timeZone,
  }).format(resetAt);
  return `${duration} · ${local}`;
}
