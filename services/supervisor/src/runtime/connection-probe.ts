import { Socket } from "node:net";
import { defaultConnectionPort, type WorktreeConnection } from "./env-file.js";

export type ConnectionProbeError = "timeout" | "refused" | "dns" | "missing-host" | "error";

export interface ConnectionProbeResult {
  id: string;
  ok: boolean;
  ms: number;
  host: string;
  port: number;
  error?: ConnectionProbeError;
}

const PROBE_TIMEOUT_MS = 3_000;

export function probeTcp(host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<Omit<ConnectionProbeResult, "id">> {
  if (!host.trim()) {
    return Promise.resolve({ ok: false, ms: 0, host, port, error: "missing-host" });
  }
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (ok: boolean, error?: ConnectionProbeError) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, ms: Date.now() - started, host, port, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") return finish(false, "refused");
      if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") return finish(false, "dns");
      finish(false, "error");
    });
    socket.connect(port, host);
  });
}

export async function probeConnections(rows: WorktreeConnection[]): Promise<ConnectionProbeResult[]> {
  return Promise.all(
    rows.map(async (row) => {
      const port = row.port || defaultConnectionPort(row.driver);
      const result = await probeTcp(row.host, port);
      return { id: row.id, ...result };
    }),
  );
}
