import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const form = await readMultipartFormData(event);
  const file = form?.find((p) => p.name === "file" && p.filename);
  const workspaceId = form?.find((p) => p.name === "workspaceId")?.data.toString();
  if (!file || !workspaceId) throw createError({ statusCode: 400 });
  const ws = platform().requireWorkspace(workspaceId);
  const dir = join(ws.worktree, "var", "uploads");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, file.filename || "upload.bin");
  writeFileSync(dest, file.data);
  return { path: dest, name: file.filename };
});
