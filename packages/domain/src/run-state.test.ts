import { describe, expect, it } from "vitest";
import { canAcquireLease, createLease, leaseExpired } from "./lease.js";
import { permissionRequestFromTitle } from "./permission-acp.js";
import { classifyMention, mentionPromptText } from "./mentions.js";
import { canTransitionRun, hasPendingProposal, transitionRun } from "./run-state.js";
import { sanitizeUploadName } from "./uploads.js";
import { selectValidationCommands, summarizeValidation } from "./validation.js";

describe("agent run state", () => {
  it("allows reviewing to accepted and rejects illegal jumps", () => {
    expect(canTransitionRun("reviewing", "accepted")).toBe(true);
    expect(() => transitionRun("queued", "pushed")).toThrow(/queued/);
    expect(hasPendingProposal([{ status: "accepted" }, { status: "pending" }])).toBe(true);
  });
});

describe("workspace lease", () => {
  it("lets the owner refresh and expires foreign leases", () => {
    const lease = createLease("s1", "u1", 1_000, 100);
    expect(canAcquireLease(lease, "s1", 1_050)).toBe(true);
    expect(canAcquireLease(lease, "s2", 1_050)).toBe(false);
    expect(leaseExpired(lease, 1_200)).toBe(true);
    expect(canAcquireLease(lease, "s2", 1_200)).toBe(true);
  });
});

describe("uploads mentions validation permissions", () => {
  it("rejects traversal filenames and keeps a stored basename", () => {
    expect(() => sanitizeUploadName("../etc/passwd")).not.toThrow();
    expect(sanitizeUploadName("../photo.PNG").storedName).toMatch(/\.png$/);
    expect(sanitizeUploadName("notes.txt").originalName).toBe("notes.txt");
    expect(() => sanitizeUploadName("payload.exe")).toThrow(/not allowed/);
  });

  it("packs mention contents as untrusted data", () => {
    expect(classifyMention("Quote", { routes: [], models: ["Quote"], pages: [] })).toBe("model");
    expect(mentionPromptText("Quote", { routes: [], models: ["Quote"], pages: [] }, "class Quote {}")).toContain(
      "Untrusted repository data",
    );
  });

  it("selects validation from changed paths", () => {
    expect(selectValidationCommands(["app/Models/User.php"])[0]?.command).toBe("php");
    expect(summarizeValidation([])).toBe("skipped");
    expect(summarizeValidation([{ id: "php-tests", code: 1, output: "fail", durationMs: 10 }])).toBe("failed");
  });

  it("maps ACP titles onto permission requests", () => {
    expect(permissionRequestFromTitle("Write app/Models/User.php", "/ws")).toMatchObject({
      kind: "write",
      path: "/ws/app/Models/User.php",
    });
    expect(permissionRequestFromTitle("Run php artisan migrate:fresh", "/ws").kind).toBe("shell");
  });
});
