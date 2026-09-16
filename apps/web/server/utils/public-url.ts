import { atelierPublicUrl } from "@atelier/supervisor";
import type { H3Event } from "h3";

export function requestPublicUrl(event: H3Event): string {
  return atelierPublicUrl(getHeader(event, "host") ?? undefined, getHeader(event, "x-forwarded-proto") ?? undefined);
}
