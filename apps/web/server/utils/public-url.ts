import { atelierPublicUrl } from "@atelier/supervisor";
import type { H3Event } from "h3";

export function requestPublicUrl(event: H3Event): string {
  const forwardedHost = getHeader(event, "x-forwarded-host");
  return atelierPublicUrl(
    forwardedHost || getHeader(event, "host") || undefined,
    getHeader(event, "x-forwarded-proto") || undefined,
    getHeader(event, "x-forwarded-port") || undefined,
  );
}
