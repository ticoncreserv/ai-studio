import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ptBR from "../../i18n/locales/pt-BR.json";
import { PREVIEW_WAIT_ROOT } from "./preview-wait";
import {
  previewLocaleFromCookie,
  previewUnavailableCopy,
  previewUnavailableDocument,
  previewUnavailablePayload,
  wantsHtmlPreview,
} from "./preview-unavailable";

describe("preview unavailable pages", () => {
  it("picks the cookie locale and HTML accept", () => {
    expect(previewLocaleFromCookie(undefined)).toBe("pt-BR");
    expect(previewLocaleFromCookie("en")).toBe("en");
    expect(previewLocaleFromCookie("en-US")).toBe("en");
    expect(previewLocaleFromCookie("pt-BR")).toBe("pt-BR");
    expect(wantsHtmlPreview("text/html,application/xhtml+xml")).toBe(true);
    expect(wantsHtmlPreview("*/*")).toBe(false);
    expect(wantsHtmlPreview("application/json")).toBe(false);
  });

  it("uses i18n copy for hibernated, down, and missing previews", () => {
    expect(previewUnavailableCopy("en", "hibernated")).toEqual({
      title: en.preview.hibernated,
      hint: en.workspace.resumeHint,
    });
    expect(previewUnavailableCopy("pt-BR", "down")).toEqual({
      title: ptBR.preview.down,
      hint: ptBR.workspace.resumeHint,
    });
    expect(previewUnavailableCopy("en", "missing").title).toBe(en.preview.notFound);
  });

  it("renders a static HTML document instead of throwing into Nuxt error.vue", () => {
    const html = previewUnavailableDocument('Title & "hint"', "<script>", "pt-BR");
    expect(html).toContain(`id="${PREVIEW_WAIT_ROOT}"`);
    expect(html).toContain("lang=\"pt-BR\"");
    expect(html).toContain("Title &amp; &quot;hint&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('data-reason="down"');
  });

  it("tags the unavailable document with the preview reason", () => {
    const html = previewUnavailablePayload("hibernated", "text/html", "en").body;
    expect(html).toContain('data-phase="error"');
    expect(html).toContain('data-reason="hibernated"');
  });

  it("returns plain text for non-HTML clients and HTML for browsers", () => {
    expect(previewUnavailablePayload("hibernated", "*/*", "en")).toEqual({
      statusMessage: "hibernated",
      contentType: "text/plain; charset=utf-8",
      body: "hibernated",
    });
    const html = previewUnavailablePayload("hibernated", "text/html", "en");
    expect(html.contentType).toContain("text/html");
    expect(html.body).toContain(en.preview.hibernated);
  });
});
