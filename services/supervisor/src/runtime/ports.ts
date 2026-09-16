import { createServer } from "node:net";

export async function allocatePort(preferred = 45400): Promise<number> {
  for (let port = preferred; port < preferred + 200; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error("No free preview port");
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}
