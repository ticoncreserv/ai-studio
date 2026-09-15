import { describe, expect, it } from "vitest";
import { AcpSession } from "./session.js";

describe("ACP client", () => {
  it("serializes initialize and authenticate envelopes", () => {
    const sent: string[] = [];
    const acp = new AcpSession("echo", [], () => undefined, () => undefined);
    (acp as unknown as { proc: { stdin: { write: (s: string) => void } } }).proc = {
      stdin: { write: (s: string) => sent.push(s) },
    };
    void acp.initialize();
    void acp.authenticate();
    expect(sent[0]).toContain('"method":"initialize"');
    expect(sent[1]).toContain("cursor_login");
  });
});
