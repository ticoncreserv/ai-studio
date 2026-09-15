import { describe, expect, it } from "vitest";
import { diffMigrations, mayMigrateForward } from "./schema-guard.js";

describe("schema guard", () => {
  it("detects divergence in both directions", () => {
    const d = diffMigrations(
      [{ name: "2024_01_01_create_users" }, { name: "2024_02_01_add_quotes" }],
      [{ migration: "2024_01_01_create_users" }, { migration: "2023_old" }],
    );
    expect(d.pendingInBranch).toEqual(["2024_02_01_add_quotes"]);
    expect(d.extraInDatabase).toEqual(["2023_old"]);
  });

  it("allows forward migrate only on the app homologation connection", () => {
    expect(mayMigrateForward("app", "homologation")).toBe(true);
    expect(mayMigrateForward("erp", "homologation")).toBe(false);
  });
});
