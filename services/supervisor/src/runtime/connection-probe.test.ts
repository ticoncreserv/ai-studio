import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { probeConnections, probeTcp } from "./connection-probe.js";

function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.end());
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

describe("connection probe", () => {
  it("reports up when the TCP port accepts a connection", async () => {
    const server = await listen();
    try {
      const result = await probeTcp("127.0.0.1", server.port, 800);
      expect(result.ok).toBe(true);
      expect(result.port).toBe(server.port);
    } finally {
      await server.close();
    }
  });

  it("reports refused on a closed loopback port", async () => {
    const result = await probeTcp("127.0.0.1", 1, 800);
    expect(result.ok).toBe(false);
    expect(result.error === "refused" || result.error === "timeout" || result.error === "error").toBe(true);
  });

  it("probes a connection list in parallel", async () => {
    const server = await listen();
    try {
      const rows = await probeConnections([
        {
          id: "app",
          name: "app",
          kind: "app",
          env: "homologation",
          driver: "mariadb",
          host: "127.0.0.1",
          port: server.port,
          database: "portal",
        },
        {
          id: "missing",
          name: "missing",
          kind: "erp",
          env: "homologation",
          driver: "mariadb",
          host: "",
          port: 3306,
          database: "",
        },
      ]);
      expect(rows.find((row) => row.id === "app")?.ok).toBe(true);
      expect(rows.find((row) => row.id === "missing")?.error).toBe("missing-host");
    } finally {
      await server.close();
    }
  });
});
