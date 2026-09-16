import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { waitForPort } from "./health.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

function listen(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    servers.push(server);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve(address.port);
    });
  });
}

describe("waitForPort", () => {
  it("returns true once the port accepts TCP", async () => {
    const port = await listen();
    await expect(waitForPort(port, 1_000)).resolves.toBe(true);
  });

  it("returns false when nothing is listening", async () => {
    await expect(waitForPort(59999, 300)).resolves.toBe(false);
  });
});
