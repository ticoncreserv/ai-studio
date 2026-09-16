import { getPlatform } from "@atelier/supervisor";

export function platform() {
  return getPlatform();
}

export function userFromEvent(event: { context?: { userId?: string } }) {
  const id = event.context?.userId;
  if (!id) return null;
  return platform().store.read().users.find((u) => u.id === id) ?? null;
}
