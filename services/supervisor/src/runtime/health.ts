import { probeTcp } from "./connection-probe.js";

export async function waitForPort(port: number, timeoutMs = 8_000, host = "127.0.0.1"): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const slice = Math.min(400, Math.max(50, deadline - Date.now()));
    const result = await probeTcp(host, port, slice);
    if (result.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return false;
}

export async function waitForHealth(url: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}
