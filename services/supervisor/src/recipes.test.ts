import { describe, expect, it } from "vitest";
import { recipeVariables } from "./recipes.js";

describe("recipeVariables", () => {
  it("returns unique placeholders in first-seen order", () => {
    expect(recipeVariables("Edit the {{model}} and the {{model}} form for {{field}}.")).toEqual(["model", "field"]);
  });

  it("ignores empty templates", () => {
    expect(recipeVariables("No placeholders here.")).toEqual([]);
  });
});
