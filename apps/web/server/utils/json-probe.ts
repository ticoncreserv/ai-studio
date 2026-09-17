import type { H3Event } from "h3";

// Chrome DevTools Protocol clients probe /json, /json/version, and /json/list on
// local HTTP ports. Answer here so Nuxt never runs Vue Router for those paths (VUE_ROUTER_R0004).
// Close the socket: probes RST idle keep-alive connections, which used to crash `nuxt dev`.
export function handleJsonProbe(event: H3Event) {
  setHeader(event, "connection", "close");
  setHeader(event, "content-type", "application/json");
  event.node?.req?.socket?.setKeepAlive(false);
  return sendNoContent(event, 404);
}
