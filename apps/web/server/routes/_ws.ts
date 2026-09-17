import { authorizeSessionSocket, bus, getPlatform } from "@atelier/supervisor";

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.url || "http://local/_ws", "http://local");
    const sessionId = url.searchParams.get("session") || "";
    const headers = (peer as { request?: { headers?: Headers } }).request?.headers;
    const cookieHeader = headers?.get("cookie") ?? (peer as { context?: { cookies?: string } }).context?.cookies;
    const origin = headers?.get("origin");
    const auth = authorizeSessionSocket({
      cookieHeader,
      sessionId,
      origin,
      platform: getPlatform(),
    });
    if (!auth.ok) {
      peer.send(JSON.stringify({ type: "error", status: auth.status, message: auth.message }));
      peer.close();
      return;
    }
    const unsub = bus.subscribe(sessionId, (event) => {
      peer.send(JSON.stringify(event));
    });
    (peer as { _unsub?: () => void })._unsub = unsub;
  },
  message(peer, message) {
    try {
      const data = JSON.parse(String(message)) as { type?: string };
      if (data.type === "ping") peer.send(JSON.stringify({ type: "pong" }));
    } catch {
      // ignore malformed frames
    }
  },
  close(peer) {
    (peer as { _unsub?: () => void })._unsub?.();
  },
});
