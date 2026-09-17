export function shouldReloadPreviewOnEvent(type: string): boolean {
  return type === "diff" || type === "checkpoint" || type === "proposal" || type === "push";
}

export function shouldReloadPreviewOnCommand(type: string): boolean {
  return type === "accept_hunk" || type === "reject_hunk" || type === "accept_file" || type === "reject_file" || type === "restore_checkpoint" || type === "sync_base" || type === "discard_proposal" || type === "push_studio";
}

export function nextPreviewEventId(events: Array<{ id: string; type: string }>, lastId = ""): string | null {
  const latest = [...events].reverse().find((event) => shouldReloadPreviewOnEvent(event.type));
  if (!latest || latest.id === lastId) return null;
  return latest.id;
}
