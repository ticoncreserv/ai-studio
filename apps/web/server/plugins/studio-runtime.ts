import { Reconciler, ensureCursorAgent, getPlatform } from "@atelier/supervisor";

declare global {
  // eslint-disable-next-line no-var
  var __atelierReconciler: Reconciler | undefined;
}

export default defineNitroPlugin(async () => {
  if (!process.env.VITEST) {
    await ensureCursorAgent().catch((error) => {
      console.error("[atelier] Cursor agent CLI is required for prompts", error);
    });
  }
  const platform = getPlatform();
  if (!process.env.VITEST) {
    await platform.probeCursorApiKeys().catch((error) => {
      console.error("[atelier] Cursor API key probe failed", error);
    });
  }
  void platform.sweepForeignWorktrees().catch((error) => {
    console.error("[atelier] failed to sweep fixture worktrees", error);
  });
  if (!globalThis.__atelierReconciler) {
    globalThis.__atelierReconciler = new Reconciler();
    globalThis.__atelierReconciler.start();
  }
});
