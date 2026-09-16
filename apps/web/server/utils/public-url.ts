import { atelierPublicUrl } from "@atelier/supervisor";
import type { H3Event } from "h3";

export function requestCallbackHost(event: H3Event): string | undefined {
  return getHeader(event, "x-forwarded-host") || getHeader(event, "host") || undefined;
}

export function requestPublicUrl(event: H3Event): string {
  return atelierPublicUrl(
    requestCallbackHost(event),
    getHeader(event, "x-forwarded-proto") || undefined,
    getHeader(event, "x-forwarded-port") || undefined,
  );
}
