import { describe, expect, it } from "vitest";
import { barPercent, buildTraceTicks, durationShare, isShellView, sqlVerb } from "./preview-debug-layout";

describe("preview debug layout", () => {
  it("reads the SQL verb", () => {
    expect(sqlVerb("select * from forms")).toBe("SELECT");
    expect(sqlVerb("  Insert into cache")).toBe("INSERT");
  });

  it("shares query time against the request", () => {
    expect(durationShare(69, 136)).toBe(51);
    expect(durationShare(10, 0)).toBeUndefined();
  });

  it("keeps short bars visible", () => {
    expect(barPercent(1, 100)).toBe(3);
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(0, 100)).toBe(0);
  });

  it("hides the Inertia blade shell", () => {
    expect(isShellView("app", "Checklists/FillUnavailable")).toBe(true);
    expect(isShellView("emails.layout", "Checklists/FillUnavailable")).toBe(false);
    expect(isShellView("app")).toBe(false);
  });

  it("places ticks on the request axis", () => {
    expect(buildTraceTicks([{ durationMs: 50, label: "q" }], 100)).toEqual([
      { left: 0, width: 50, label: "q", durationMs: 50 },
    ]);
  });

  it("ignores Debugbar start timestamps outside the request", () => {
    expect(buildTraceTicks([{ durationMs: 20, startMs: 1_700_000_000, label: "q" }], 100)).toEqual([
      { left: 0, width: 20, label: "q", durationMs: 20 },
    ]);
  });
});
