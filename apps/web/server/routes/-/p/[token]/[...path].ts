import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token")!;
  const rest = getRouterParam(event, "path") || "";
  const ws = platform().store.read().workspaces.find((w) => w.previewToken === token);
  if (!ws) throw createError({ statusCode: 404, statusMessage: "preview not found" });
  if (!ws.port) {
    throw createError({ statusCode: 503, statusMessage: "hibernated" });
  }
  const incoming = getRequestURL(event);
  const target = `http://127.0.0.1:${ws.port}/${rest}${incoming.search}`;
  const res = await fetch(target, {
    headers: { accept: getHeader(event, "accept") || "*/*" },
  });
  const headers = new Headers(res.headers);
  headers.delete("x-frame-options");
  headers.set("content-security-policy", "frame-ancestors *");
  const buf = Buffer.from(await res.arrayBuffer());
  setResponseStatus(event, res.status);
  for (const [k, v] of headers.entries()) {
    if (k === "transfer-encoding") continue;
    setHeader(event, k, v);
  }
  return buf;
});
