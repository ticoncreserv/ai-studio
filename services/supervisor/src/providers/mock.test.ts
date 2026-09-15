import { describe, expect, it } from "vitest";
import { SessionEventSchema } from "@atelier/contracts";
import { loadTranscript, MockProvider } from "./mock.js";

describe("MockProvider", () => {
  it("replays a valid session-event transcript", async () => {
    const events = loadTranscript("create-inertia-page.ndjson");
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(SessionEventSchema.parse(event).type).toBe(event.type);
    }
    const seen: string[] = [];
    const run = await new MockProvider().start({
      cwd: "/tmp",
      onEvent: (e) => seen.push(e.type),
    });
    await run.prompt([{ type: "text", text: "go" }]);
    expect(seen).toContain("diff");
  });
});
