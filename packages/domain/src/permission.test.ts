import { describe, expect, it } from "vitest";
import { evaluatePermission, isDestructiveDatabaseCommand } from "./permission.js";

describe("permission policy", () => {
  it("auto-allows worktree writes and denies env files", () => {
    expect(
      evaluatePermission({ kind: "write", path: "/ws/app/Models/User.php", worktree: "/ws" }),
    ).toBe("auto-allow");
    expect(evaluatePermission({ kind: "read", path: "/ws/.env", worktree: "/ws" })).toBe("auto-deny");
    expect(evaluatePermission({ kind: "read", path: "/ws/.env.local", worktree: "/ws" })).toBe("auto-deny");
    expect(evaluatePermission({ kind: "write", path: "/ws/../outside.php", worktree: "/ws" })).toBe(
      "auto-deny",
    );
    expect(evaluatePermission({ kind: "read", path: "/ws-other/file.php", worktree: "/ws" })).toBe(
      "auto-deny",
    );
  });

  it("blocks destructive database commands", () => {
    expect(isDestructiveDatabaseCommand("php artisan migrate:fresh")).toBe(true);
    expect(evaluatePermission({ kind: "shell", command: "php artisan db:wipe", worktree: "/ws" })).toBe(
      "auto-deny",
    );
  });
});
