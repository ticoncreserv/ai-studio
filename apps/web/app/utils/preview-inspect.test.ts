import { describe, expect, it } from "vitest";
import { formatInspectNote, formatInspectRegionNote, inspectChipLabel, inspectLabel, inspectTooltipPosition, joinInspectTexts, mergeInspectPins, toInspectPin, type PreviewInspectTarget } from "./preview-inspect";

const loginButton: PreviewInspectTarget = {
  tag: "button",
  selector: 'button[data-test="login-button"]',
  xpath: "/html/body/div/form/button[1]",
  page: "/-/p/tok/login",
  component: "Button",
  role: "button",
  name: "Entrar",
  testId: "login-button",
};

describe("preview inspect notes", () => {
  it("pins element facts without telling the agent what to do", () => {
    const note = formatInspectNote(loginButton);
    expect(note).toContain('selector: button[data-test="login-button"]');
    expect(note).toContain("component: Button");
    expect(note).toContain("xpath:");
    expect(note).not.toMatch(/Change this|Comment on/i);
    expect(note).not.toMatch(/\d+%/);
  });

  it("labels the hover chip with tag and accessible name", () => {
    expect(inspectLabel(loginButton)).toBe("button “Entrar”");
    expect(inspectLabel({ tag: "div", selector: "div", xpath: "/div" })).toBe("div");
  });

  it("separates sibling texts in the inspect tooltip", () => {
    expect(joinInspectTexts(["Lembrar meus dados", "Esqueceu sua senha?"])).toBe(
      "Lembrar meus dados · Esqueceu sua senha?",
    );
    expect(joinInspectTexts(["Entrar"])).toBe("Entrar");
  });

  it("parks the tooltip above the highlight with a gap, or below when there is no room", () => {
    expect(inspectTooltipPosition({ left: 40, top: 80, height: 24 })).toEqual({ left: 40, top: 50 });
    expect(inspectTooltipPosition({ left: 12, top: 10, height: 28 })).toEqual({ left: 12, top: 46 });
  });

  it("shows a compact composer chip from the component name", () => {
    expect(inspectChipLabel(loginButton)).toBe("Button");
    expect(inspectChipLabel({ tag: "h1", selector: "h1", xpath: "/h1", name: "Welcome" })).toBe("Welcome");
    expect(toInspectPin(loginButton)).toEqual({
      label: "Button",
      note: formatInspectNote(loginButton).trim(),
    });
    expect(mergeInspectPins([toInspectPin(loginButton)], [toInspectPin(loginButton)])).toHaveLength(1);
  });

  it("lists region hits as the same fact blocks", () => {
    const note = formatInspectRegionNote([loginButton, { tag: "a", selector: "a.link", xpath: "/a", name: "Forgot" }]);
    expect(note).toContain("login-button");
    expect(note).toContain("selector: a.link");
    expect(note).not.toMatch(/Change this|Elements inside/i);
    expect(formatInspectRegionNote([])).toBe("");
  });
});
