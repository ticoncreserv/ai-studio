import { Reconciler, getPlatform } from "@atelier/supervisor";

declare global {
  // eslint-disable-next-line no-var
  var __atelierReconciler: Reconciler | undefined;
}

export default defineNitroPlugin(() => {
  const platform = getPlatform();
  void platform.sweepForeignWorktrees().catch((error) => {
    console.error("[atelier] failed to sweep fixture worktrees", error);
  });
  if (!globalThis.__atelierReconciler) {
    globalThis.__atelierReconciler = new Reconciler();
    globalThis.__atelierReconciler.start();
  }
});
