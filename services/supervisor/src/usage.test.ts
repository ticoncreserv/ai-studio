import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderId } from "@atelier/contracts";
import { defaultUsageProfiles } from "@atelier/domain";
import { eventsFromAcpUpdate } from "./acp/events.js";
import { Platform } from "./platform.js";
import type { AgentProvider, ProviderRun } from "./providers/types.js";
import { JsonStore, type UserRecord } from "./store.js";
import {
  costDelta,
  createRunMeter,
  estimatePromptBlockTokens,
  ledgerEntryFromMeter,
  meterBillableTokens,
  meterEstimatedTokens,
  meterSessionEvent,
  UsageLimitError,
} from "./usage.js";

const dirs: string[] = [];

function platform(providerFactory?: (id: ProviderId) => AgentProvider): Platform {
  const dir = mkdtempSync(join(tmpdir(), "atelier-usage-"));
  dirs.push(dir);
  process.env.ATELIER_WORKTREE_ROOT = join(dir, "workspaces");
  return new Platform(new JsonStore(join(dir, "platform.json")), providerFactory);
}

/** Emits the session events a test asks for, without touching the worktree. */
function scriptedProvider(script: (emit: (event: Parameters<typeof meterSessionEvent>[1]) => void) => void): (id: ProviderId) => AgentProvider {
  return () => ({
    capability: {
      id: "mock",
      label: "Scripted provider",
      command: "mock",
      args: [],
      modes: ["agent"],
      images: false,
      todos: false,
      plans: false,
      questions: false,
    },
    start: async ({ onEvent }): Promise<ProviderRun> => ({
      prompt: async () => {
        script((event) => onEvent?.(event));
      },
      cancel: async () => undefined,
      stop: () => undefined,
    }),
  });
}

async function seatedUser(p: Platform, login: string): Promise<{ user: UserRecord; workspaceId: string; sessionId: string }> {
  const user = await p.loginDev(login);
  const ws = await p.ensureWorkspace(user);
  const session = p.createSession(ws.id, "mock");
  return { user, workspaceId: ws.id, sessionId: session.id };
}

async function promptAndFlush(
  p: Platform,
  input: { user: UserRecord; workspaceId: string; sessionId: string },
  text: string,
) {
  await p.handleCommand({ user: input.user, sessionId: input.sessionId, command: { type: "prompt", text, attachments: [], mentions: [] } });
  await p.flushWorkspace(input.workspaceId);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("run meter", () => {
  it("counts streamed output and tool call output", () => {
    const meter = createRunMeter(100);
    meterSessionEvent(meter, { type: "assistant_delta", id: "1", at: "t", text: "x".repeat(400) });
    meterSessionEvent(meter, { type: "tool_call", id: "2", at: "t", toolCallId: "c1", name: "edit", status: "running", output: "y".repeat(80) });
    expect(meter.outputTokens).toBe(120);
    expect(meter.toolCalls).toBe(1);
    expect(meterEstimatedTokens(meter)).toBe(220);
  });

  it("keeps the provider context peak and cumulative cost", () => {
    const meter = createRunMeter(0);
    meterSessionEvent(meter, { type: "usage", id: "1", at: "t", v: 1, contextUsed: 53_000, contextSize: 200_000, costUsd: 0.045 });
    meterSessionEvent(meter, { type: "usage", id: "2", at: "t", v: 1, contextUsed: 12_000, contextSize: 200_000, costUsd: 0.06 });
    expect(meter.contextPeakTokens).toBe(53_000);
    expect(meter.cumulativeCostUsd).toBe(0.06);
    expect(meter.sawProvider).toBe(true);
    const profile = defaultUsageProfiles()[1]!;
    expect(meterBillableTokens(meter, profile)).toBe(53_000);
    expect(meterBillableTokens(meter, { ...profile, meter: "estimated" })).toBe(0);
  });

  it("charges only the growth over the session cost baseline", () => {
    expect(costDelta(0, 0.045)).toBeCloseTo(0.045);
    expect(costDelta(0.045, 0.06)).toBeCloseTo(0.015);
    expect(costDelta(0.06, 0.06)).toBe(0);
    expect(costDelta(0.06, 0)).toBe(0);
  });

  it("estimates attachment blocks", () => {
    expect(estimatePromptBlockTokens([{ type: "text", text: "abcd" }])).toBe(1);
    expect(estimatePromptBlockTokens([{ type: "image", data: "z".repeat(1_500), mimeType: "image/png" }])).toBe(2);
    expect(estimatePromptBlockTokens([{ type: "text" }])).toBe(0);
  });

  it("stamps period and day keys on the ledger entry", () => {
    const meter = createRunMeter(10);
    meterSessionEvent(meter, { type: "usage", id: "1", at: "t", v: 1, contextUsed: 1, contextSize: 2, costUsd: 0 });
    const entry = ledgerEntryFromMeter({
      id: "l1",
      meter,
      userId: "u1",
      workspaceId: "w1",
      sessionId: "s1",
      runId: "r1",
      provider: "cursor",
      costUsd: 0.123456789,
      at: new Date("2026-10-01T01:30:00.000Z"),
      tz: "America/Sao_Paulo",
    });
    expect(entry.periodKey).toBe("2026-09");
    expect(entry.dayKey).toBe("2026-09-30");
    expect(entry.costUsd).toBe(0.123457);
    expect(entry.source).toBe("mixed");
  });
});

describe("acp usage_update", () => {
  it("becomes a usage event", () => {
    const events = eventsFromAcpUpdate({
      method: "session/update",
      params: {
        sessionId: "s1",
        update: { sessionUpdate: "usage_update", used: 53_000, size: 200_000, cost: { amount: 0.045, currency: "USD" } },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "usage", contextUsed: 53_000, contextSize: 200_000, costUsd: 0.045 });
  });

  it("tolerates a provider that omits cost", () => {
    const events = eventsFromAcpUpdate({
      params: { update: { sessionUpdate: "usage_update", used: 10, size: 100 } },
    });
    expect(events[0]).toMatchObject({ type: "usage", costUsd: 0 });
  });
});

describe("platform metering", () => {
  it("writes one ledger entry per run and reports it in the summary", async () => {
    const p = platform(scriptedProvider((emit) => {
      emit({ type: "assistant_delta", id: "d1", at: "t", text: "z".repeat(2_000) });
    }));
    const seated = await seatedUser(p, "meter-one");
    await promptAndFlush(p, seated, "Say hello");

    const ledger = p.store.read().usageLedger;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.userId).toBe(seated.user.id);
    expect(ledger[0]!.inputTokens).toBeGreaterThan(0);
    expect(ledger[0]!.outputTokens).toBe(500);
    expect(ledger[0]!.source).toBe("estimated");

    const summary = p.usageSummary(seated.user.id);
    expect(summary.profileId).toBe("standard");
    expect(summary.runs).toBe(1);
    expect(summary.periodTokens).toBe(ledger[0]!.estimatedTokens);
    expect(summary.remainingTokens).toBe(summary.limitTokens - summary.periodTokens);
  });

  it("records the provider cost once across two runs in a session", async () => {
    let cumulative = 0.045;
    const p = platform(scriptedProvider((emit) => {
      emit({ type: "usage", id: "u", at: "t", v: 1, contextUsed: 30_000, contextSize: 200_000, costUsd: cumulative });
    }));
    const seated = await seatedUser(p, "meter-cost");
    await promptAndFlush(p, seated, "First");
    cumulative = 0.06;
    await promptAndFlush(p, seated, "Second");

    const ledger = p.store.read().usageLedger;
    expect(ledger).toHaveLength(2);
    expect(ledger[0]!.costUsd).toBeCloseTo(0.045);
    expect(ledger[1]!.costUsd).toBeCloseTo(0.015);
    expect(p.store.read().sessions.find((row) => row.id === seated.sessionId)?.costBaselineUsd).toBeCloseTo(0.06);
    expect(p.store.read().usageLedger.reduce((sum, row) => sum + row.costUsd, 0)).toBeCloseTo(0.06);
  });

  it("skips the ledger when metering is off", async () => {
    const p = platform(scriptedProvider(() => undefined));
    const seated = await seatedUser(p, "meter-off");
    p.saveFlags({ usageMetering: false });
    await promptAndFlush(p, seated, "Quiet");
    expect(p.store.read().usageLedger).toEqual([]);
  });
});

describe("platform enforcement", () => {
  it("blocks a prompt over the monthly limit before starting a provider", async () => {
    let starts = 0;
    const p = platform(() => {
      const provider = scriptedProvider(() => undefined)("mock");
      return {
        ...provider,
        start: async (input) => {
          starts += 1;
          return provider.start(input);
        },
      };
    });
    const { user, sessionId } = await seatedUser(p, "blocked");
    const admin = await p.loginDev("ticoncreserv");
    p.saveUsageProfiles(admin, p.usageProfiles().map((row) =>
      row.id === "standard" ? { ...row, limits: { monthlyTokens: 1 } } : row,
    ));

    await expect(
      p.handleCommand({ user, sessionId, command: { type: "prompt", text: "Please build a page", attachments: [], mentions: [] } }),
    ).rejects.toBeInstanceOf(UsageLimitError);
    expect(starts).toBe(0);

    const state = p.snapshot(sessionId);
    expect(state.budgetCut).toContain("monthly");
    expect(state.run?.status).toBe("rejected");
  });

  it("lets a grant unblock the same prompt", async () => {
    const p = platform(scriptedProvider(() => undefined));
    const { user, workspaceId, sessionId } = await seatedUser(p, "granted");
    const admin = await p.loginDev("ticoncreserv");
    p.saveUsageProfiles(admin, p.usageProfiles().map((row) =>
      row.id === "standard" ? { ...row, limits: { monthlyTokens: 1 } } : row,
    ));
    await expect(
      p.handleCommand({ user, sessionId, command: { type: "prompt", text: "Build it", attachments: [], mentions: [] } }),
    ).rejects.toBeInstanceOf(UsageLimitError);

    p.grantUsageTokens(admin, user.id, 1_000_000, "release week");
    await promptAndFlush(p, { user, workspaceId, sessionId }, "Build it");
    expect(p.store.read().usageLedger).toHaveLength(1);
    expect(p.usageSummary(user.id).grantedTokens).toBe(1_000_000);
  });

  it("stops a run that crosses the monthly token cap", async () => {
    const p = platform(scriptedProvider((emit) => {
      emit({ type: "assistant_delta", id: "d1", at: "t", text: "z".repeat(40_000) });
      emit({ type: "assistant_delta", id: "d2", at: "t", text: "z".repeat(40_000) });
    }));
    const seated = await seatedUser(p, "monthly-mid-run");
    const admin = await p.loginDev("ticoncreserv");
    p.saveUsageProfiles(admin, p.usageProfiles().map((row) =>
      row.id === "standard" ? { ...row, limits: { monthlyTokens: 5_000 } } : row,
    ));

    await promptAndFlush(p, seated, "Write a lot");
    expect(p.snapshot(seated.sessionId).budgetCut).toContain("monthly");
  });

  it("does not block when the limits flag is off", async () => {
    const p = platform(scriptedProvider(() => undefined));
    const seated = await seatedUser(p, "flag-off");
    const admin = await p.loginDev("ticoncreserv");
    p.saveUsageProfiles(admin, p.usageProfiles().map((row) =>
      row.id === "standard" ? { ...row, limits: { ...row.limits, monthlyTokens: 1 } } : row,
    ));
    p.saveFlags({ usageLimits: false });
    await promptAndFlush(p, seated, "Build it");
    expect(p.store.read().usageLedger).toHaveLength(1);
  });

  it("blocks a provider the profile does not allow", async () => {
    const p = platform(scriptedProvider(() => undefined));
    const { user, sessionId } = await seatedUser(p, "provider-list");
    const admin = await p.loginDev("ticoncreserv");
    p.saveUsageProfiles(admin, p.usageProfiles().map((row) => (row.id === "standard" ? { ...row, providers: ["cursor"] } : row)));
    await expect(
      p.handleCommand({ user, sessionId, command: { type: "prompt", text: "Build it", attachments: [], mentions: [] } }),
    ).rejects.toBeInstanceOf(UsageLimitError);
  });
});

describe("profile administration", () => {
  it("assigns a profile and rejects unknown ones", async () => {
    const p = platform();
    const admin = await p.loginDev("ticoncreserv");
    const user = await p.loginDev("assigned");
    expect(p.usageSummary(user.id).profileId).toBe("standard");
    expect(p.setUserUsageProfile(admin, user.id, "premium").profileId).toBe("premium");
    expect(p.listUsers().find((row) => row.id === user.id)?.usageProfileLabel).toBe("Premium");
    expect(() => p.setUserUsageProfile(admin, user.id, "nope")).toThrow(/Profile not found/);
  });

  it("refuses profile edits from a non-admin", async () => {
    const p = platform();
    const admin = await p.loginDev("ticoncreserv");
    const user = await p.loginDev("regular");
    expect(p.isPlatformAdmin(admin)).toBe(true);
    expect(p.isPlatformAdmin(user)).toBe(false);
    expect(() => p.saveUsageProfiles(user, p.usageProfiles())).toThrow(/Forbidden/);
    expect(() => p.grantUsageTokens(user, user.id, 100, "self")).toThrow(/Forbidden/);
  });

  it("rejects malformed limits", async () => {
    const p = platform();
    const admin = await p.loginDev("ticoncreserv");
    const bad = p.usageProfiles().map((row) =>
      row.id === "starter" ? { ...row, limits: { ...row.limits, monthlyTokens: -5 } } : row,
    );
    expect(() => p.saveUsageProfiles(admin, bad)).toThrow();
    const duplicated = [p.usageProfiles()[0]!, p.usageProfiles()[0]!];
    expect(() => p.saveUsageProfiles(admin, duplicated)).toThrow(/Duplicate profile id/);
  });

  it("adds a plan and refuses to drop one that still has people", async () => {
    const p = platform();
    const admin = await p.loginDev("ticoncreserv");
    const user = await p.loginDev("assigned");
    p.setUserUsageProfile(admin, user.id, "starter");
    const extra = {
      ...p.usageProfiles()[1]!,
      id: "agency",
      label: "Agency",
    };
    expect(p.saveUsageProfiles(admin, [...p.usageProfiles(), extra]).map((row) => row.id)).toContain("agency");
    const withoutStarter = p.usageProfiles().filter((row) => row.id !== "starter");
    expect(() => p.saveUsageProfiles(admin, withoutStarter)).toThrow(/still has people/);
  });

  it("migrates people when deleting a plan and keeps at least one", async () => {
    const p = platform();
    const admin = await p.loginDev("ticoncreserv");
    const user = await p.loginDev("assigned");
    p.setUserUsageProfile(admin, user.id, "starter");
    expect(() => p.deleteUsageProfile(admin, "starter")).toThrow(/migrateTo required/);
    expect(p.deleteUsageProfile(admin, "starter", "premium").map((row) => row.id)).toEqual(["standard", "premium"]);
    expect(p.usageSummary(user.id).profileId).toBe("premium");
    expect(() => p.deleteUsageProfile(admin, "standard")).toThrow(/migrateTo required/);
    expect(p.deleteUsageProfile(admin, "standard", "premium").map((row) => row.id)).toEqual(["premium"]);
    expect(() => p.deleteUsageProfile(admin, "premium")).toThrow(/last usage profile/);
  });

  it("rolls expired entries into a rollup and keeps the total", async () => {
    const p = platform();
    const user = await p.loginDev("retained");
    p.store.update((db) => {
      db.usageLedger.push({
        id: "old",
        userId: user.id,
        workspaceId: "w1",
        sessionId: "s1",
        runId: "r1",
        provider: "cursor",
        at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
        periodKey: "2026-01",
        dayKey: "2026-01-05",
        inputTokens: 100,
        outputTokens: 200,
        estimatedTokens: 300,
        contextPeakTokens: 0,
        costUsd: 0.5,
        toolCalls: 1,
        source: "estimated",
      });
    });
    expect(p.pruneUsageLedger()).toEqual({ pruned: 1 });
    expect(p.store.read().usageLedger).toHaveLength(0);
    expect(p.store.read().usageRollups[0]).toMatchObject({ userId: user.id, periodKey: "2026-01", tokens: 300, runs: 1 });
    expect(p.pruneUsageLedger()).toEqual({ pruned: 0 });
  });
});
