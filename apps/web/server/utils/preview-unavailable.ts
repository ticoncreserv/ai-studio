import en from "../../i18n/locales/en.json";
import ptBR from "../../i18n/locales/pt-BR.json";
import { PREVIEW_WAIT_ROOT, previewWaitStyle } from "./preview-wait";

export type PreviewUnavailableReason = "hibernated" | "missing" | "down";

const catalogs = { en, "pt-BR": ptBR } as const;

export function previewLocaleFromCookie(cookie: string | undefined): keyof typeof catalogs {
  return cookie?.toLowerCase().startsWith("en") ? "en" : "pt-BR";
}

export function wantsHtmlPreview(accept: string | undefined): boolean {
  return (accept ?? "").includes("text/html");
}

export function previewUnavailableCopy(locale: keyof typeof catalogs, reason: PreviewUnavailableReason) {
  const messages = catalogs[locale];
  if (reason === "missing") {
    return { title: messages.preview.notFound, hint: messages.errors.generic };
  }
  if (reason === "hibernated") {
    return { title: messages.preview.hibernated, hint: messages.workspace.resumeHint };
  }
  return { title: messages.preview.down, hint: messages.workspace.resumeHint };
}

export function previewUnavailableDocument(
  title: string,
  hint: string,
  lang: string,
  reason: PreviewUnavailableReason = "down",
): string {
  const safeTitle = escapeHtml(title);
  const safeHint = escapeHtml(hint);
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>${previewWaitStyle()}</style></head><body><div id="${PREVIEW_WAIT_ROOT}" data-phase="error" data-reason="${escapeHtml(reason)}" role="status" aria-live="polite" aria-busy="false"><div class="aw-card"><p class="aw-title">${safeTitle}</p><p class="aw-hint">${safeHint}</p></div></div></body></html>`;
}

export function previewUnavailablePayload(
  reason: PreviewUnavailableReason,
  accept: string | undefined,
  localeCookie: string | undefined,
) {
  const locale = previewLocaleFromCookie(localeCookie);
  const copy = previewUnavailableCopy(locale, reason);
  const statusMessage =
    reason === "missing" ? "preview not found" : reason === "hibernated" ? "hibernated" : "preview process is not running";
  if (!wantsHtmlPreview(accept)) {
    return { statusMessage, contentType: "text/plain; charset=utf-8", body: statusMessage };
  }
  return {
    statusMessage,
    contentType: "text/html; charset=utf-8",
    body: previewUnavailableDocument(copy.title, copy.hint, locale, reason),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
