import { describe, expect, it } from "vitest";
import { resolveAppLocale } from "./app-locale";

describe("resolveAppLocale", () => {
  it("defaults to pt-BR unless the cookie is an explicit English choice", () => {
    expect(resolveAppLocale(undefined)).toBe("pt-BR");
    expect(resolveAppLocale(null)).toBe("pt-BR");
    expect(resolveAppLocale("")).toBe("pt-BR");
    expect(resolveAppLocale("pt-BR")).toBe("pt-BR");
    expect(resolveAppLocale("pt")).toBe("pt-BR");
    expect(resolveAppLocale("en-US")).toBe("pt-BR");
    expect(resolveAppLocale("en")).toBe("en");
  });
});
