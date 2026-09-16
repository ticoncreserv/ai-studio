export function shouldReloadPreviewOnEvent(type: string): boolean {
  return type === "diff" || type === "checkpoint";
}

export function shouldReloadPreviewOnCommand(type: string): boolean {
  return type === "accept_hunk" || type === "reject_hunk" || type === "restore_checkpoint" || type === "sync_base";
}

export function nextPreviewEventId(events: Array<{ id: string; type: string }>, lastId = ""): string | null {
  const latest = [...events].reverse().find((event) => shouldReloadPreviewOnEvent(event.type));
  if (!latest || latest.id === lastId) return null;
  return latest.id;
}
