import { getPlatform } from "./platform.js";

export class Reconciler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        getPlatform().reconcile();
      } catch (error) {
        console.error("[reconciler]", error);
      }
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
