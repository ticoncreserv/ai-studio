import { describe, expect, it } from "vitest";
import { seedI18nContextForErrorRender } from "./i18n-error-context";

describe("seedI18nContextForErrorRender", () => {
  it("fills a missing i18n context before Nuxt renders /__nuxt_error", () => {
    const context: Record<string, unknown> = {};
    seedI18nContextForErrorRender({
      name: "render:before",
      args: ["render:before", { event: { context } }],
    });
    expect(context.nuxtI18n).toEqual(
      expect.objectContaining({
        vueI18nOptions: { defaultLocale: "pt-BR" },
      }),
    );
  });

  it("leaves an existing context and unrelated hooks alone", () => {
    const existing = { vueI18nOptions: { defaultLocale: "en" } };
    const context: Record<string, unknown> = { nuxtI18n: existing };
    const other: Record<string, unknown> = {};
    seedI18nContextForErrorRender({
      name: "render:before",
      args: ["render:before", { event: { context } }],
    });
    expect(context.nuxtI18n).toBe(existing);
    seedI18nContextForErrorRender({ name: "request", args: [{ event: { context: other } }] });
    expect(other.nuxtI18n).toBeUndefined();
  });
});
