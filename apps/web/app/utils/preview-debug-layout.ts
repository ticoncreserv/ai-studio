export type TraceTick = { left: number; width: number; label: string; durationMs: number };

export function sqlVerb(sql: string): string | undefined {
  const match = sql.trim().match(/^([a-zA-Z]+)/);
  return match?.[1]?.toUpperCase();
}

export function durationShare(part?: number, total?: number): number | undefined {
  if (part == null || total == null || total <= 0) return undefined;
  return Math.round((part / total) * 100);
}

export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(3, Math.min(100, (value / max) * 100));
}

export function isShellView(name: string, inertiaComponent?: string): boolean {
  return Boolean(inertiaComponent) && name.trim().toLowerCase() === "app";
}

export function buildTraceTicks(
  rows: Array<{ durationMs?: number; startMs?: number; label: string }>,
  totalMs: number,
): TraceTick[] {
  const total = totalMs > 0 ? totalMs : 1;
  let cursor = 0;
  return rows
    .filter((row) => (row.durationMs ?? 0) > 0)
    .map((row) => {
      const duration = Math.max(row.durationMs ?? 1, 1);
      const usableStart = row.startMs != null && row.startMs >= 0 && row.startMs <= total;
      const start = usableStart ? row.startMs : cursor;
      cursor = start + duration;
      const left = Math.min(100, (start / total) * 100);
      const width = Math.max(1.4, Math.min(100 - left, (duration / total) * 100));
      return { left, width, label: row.label, durationMs: duration };
    });
}
