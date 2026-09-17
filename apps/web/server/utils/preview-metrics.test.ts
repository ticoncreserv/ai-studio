import { describe, expect, it } from "vitest";
import {
  injectPreviewMetrics,
  latestDebugbarDataset,
  parseDebugbarDataset,
  parseDurationMs,
  parseMemoryMb,
  parsePageContext,
  parseQueryDurationMs,
  PREVIEW_METRICS_MARK,
  previewMetricsScript,
} from "./preview-metrics";

describe("preview metrics parser", () => {
  it("parses duration as seconds or a unit string", () => {
    expect(parseDurationMs(0.123)).toBe(123);
    expect(parseDurationMs(1500)).toBe(1500);
    expect(parseDurationMs(undefined, "42ms")).toBe(42);
    expect(parseDurationMs(undefined, "1.5s")).toBe(1500);
  });

  it("parses query duration as milliseconds", () => {
    expect(parseQueryDurationMs(42, "42ms")).toBe(42);
    expect(parseQueryDurationMs(18.4)).toBe(18);
  });

  it("parses memory as bytes or a unit string", () => {
    expect(parseMemoryMb(10 * 1024 * 1024)).toBe(10);
    expect(parseMemoryMb(undefined, "12.4 MB")).toBe(12.4);
    expect(parseMemoryMb(undefined, "512 KB")).toBe(0.5);
  });

  it("returns empty metrics for an empty dataset", () => {
    expect(parseDebugbarDataset({})).toEqual({
      nPlusOne: false,
      duplicates: [],
      statements: [],
      measures: [],
      views: [],
      models: [],
    });
    expect(parseDebugbarDataset(null)).toEqual({
      nPlusOne: false,
      duplicates: [],
      statements: [],
      measures: [],
      views: [],
      models: [],
    });
  });

  it("reads time, queries, memory, and uri from a Debugbar dataset", () => {
    expect(
      parseDebugbarDataset({
        __meta: { uri: "/login", method: "GET" },
        time: { duration: 0.08, duration_str: "80ms" },
        memory: { peak_usage: 28 * 1024 * 1024 },
        queries: { nb_statements: 4, statements: [{ sql: "select 1", duration: 12, duration_str: "12ms" }] },
      }),
    ).toMatchObject({
      timeMs: 80,
      queries: 4,
      memoryMb: 28,
      nPlusOne: false,
      duplicates: [],
      uri: "/login",
      method: "GET",
      statements: [{ sql: "select 1", durationMs: 12 }],
    });
  });

  it("collects measures, views, models, route, and ignores connection noise", () => {
    const parsed = parseDebugbarDataset({
      time: {
        duration: 0.2,
        measures: [{ label: "Booting", duration: 0.05, duration_str: "50ms" }],
      },
      queries: {
        nb_statements: 5,
        accumulated_duration: 90,
        accumulated_duration_str: "90ms",
        statements: [
          { sql: "Connection Established", duration: 1 },
          { sql: "select 1", duration: 10, duration_str: "10ms", connection: "mysql" },
        ],
      },
      views: { templates: [{ name: "layouts.app", param_count: 3 }] },
      models: { data: { "App\\Models\\User": 4 } },
      route: { uri: "login", controller: "AuthController@show", middleware: ["web", "guest"] },
      laravel: { version: "13.0", environment: "local" },
      exceptions: { count: 1, exceptions: [{ message: "Whoops" }] },
    });
    expect(parsed.nPlusOne).toBe(false);
    expect(parsed.queryMs).toBe(90);
    expect(parsed.statements).toEqual([{ sql: "select 1", durationMs: 10, connection: "mysql" }]);
    expect(parsed.measures).toEqual([{ label: "Booting", durationMs: 50 }]);
    expect(parsed.views).toEqual([{ name: "layouts.app", count: 3 }]);
    expect(parsed.models).toEqual([{ class: "App\\Models\\User", count: 4 }]);
    expect(parsed.route).toEqual({ uri: "login", controller: "AuthController@show", middleware: "web, guest" });
    expect(parsed.laravel).toEqual({ version: "13.0", environment: "local" });
    expect(parsed.exceptions).toEqual({ count: 1, message: "Whoops" });
  });

  it("reads Laravel version and environment from the Debugbar tooltip", () => {
    expect(
      parseDebugbarDataset({
        laravel: { version: "13.x", tooltip: { "Laravel Version": "13.32.0", Environment: "local" } },
      }).laravel,
    ).toEqual({ version: "13.x", environment: "local" });
  });

  it("flags N+1 when the same SQL runs at least three times", () => {
    const sql = "select * from users where id = ?";
    const parsed = parseDebugbarDataset({
      queries: {
        nb_statements: 5,
        statements: [{ sql }, { sql }, { sql }, { sql }, { sql: "select 1" }],
      },
    });
    expect(parsed.nPlusOne).toBe(true);
    expect(parsed.duplicates).toEqual([{ sql, count: 4 }]);
  });

  it("ignores Debugbar connection noise when detecting N+1", () => {
    expect(
      parseDebugbarDataset({
        queries: {
          nb_statements: 5,
          statements: [
            { sql: "Connection Established" },
            { sql: "Connection Established" },
            { sql: "Connection Established" },
            { sql: "select 1" },
          ],
        },
      }).nPlusOne,
    ).toBe(false);
  });

  it("uses Debugbar duplicate counts and top-level uri when statements are missing", () => {
    expect(
      parseDebugbarDataset({
        uri: "/quotes",
        queries: { nb_statements: 9, accumulated_duplicate_queries: 6 },
      }),
    ).toMatchObject({
      queries: 9,
      nPlusOne: true,
      duplicates: [{ sql: "duplicate queries", count: 6 }],
      uri: "/quotes",
    });
  });

  it("reads Inertia page context without props", () => {
    expect(
      parsePageContext({
        title: "Checklists",
        dataPage: JSON.stringify({ component: "Checklists/Index", url: "/checklists", props: { secret: "nope" } }),
      }),
    ).toEqual({ title: "Checklists", inertiaComponent: "Checklists/Index", inertiaUrl: "/checklists" });
    expect(parsePageContext({ dataPage: "app" })).toEqual({
      title: undefined,
      inertiaComponent: undefined,
      inertiaUrl: undefined,
    });
  });

  it("picks the last Debugbar dataset", () => {
    expect(latestDebugbarDataset({ datasets: { a: { queries: { nb_statements: 1 } }, b: { queries: { nb_statements: 9 } } } })).toEqual({
      queries: { nb_statements: 9 },
    });
    expect(latestDebugbarDataset({ dataMap: [{ data: { n: 1 } }, { data: { n: 2 } }] })).toEqual({ n: 2 });
  });
});

describe("preview metrics injection", () => {
  it("injects an idempotent script before </body>", () => {
    const html = injectPreviewMetrics(`<html><body><div id="app"></div></body></html>`);
    expect(html).toContain(PREVIEW_METRICS_MARK);
    expect(html).toContain("atelier-preview-metrics");
    expect(html).toContain("inertiaComponent");
    expect(previewMetricsScript()).toContain("script[data-page]");
    expect(html.indexOf(PREVIEW_METRICS_MARK)).toBeLessThan(html.toLowerCase().lastIndexOf("</body>"));
    expect(injectPreviewMetrics(html)).toBe(html);
    expect(previewMetricsScript()).toContain("missing:true");
    expect(injectPreviewMetrics("<div></div>")).toBe("<div></div>");
  });
});
