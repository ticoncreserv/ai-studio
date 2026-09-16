import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireWorkspaceAccess } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  const file = form?.find((part) => part.name === "file" && part.filename);
  const workspaceId = form?.find((part) => part.name === "workspaceId")?.data.toString();
  if (!file || !workspaceId) throw createError({ statusCode: 400 });
  const { workspace: ws } = requireWorkspaceAccess(event, workspaceId, "edit");
  const dir = join(ws.worktree, "var", "uploads");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, file.filename || "upload.bin");
  writeFileSync(dest, file.data);
  return { path: dest, name: file.filename };
});
