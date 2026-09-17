import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertUploadSize, sanitizeUploadName, UploadError } from "@atelier/domain";
import { resolveWorktreePath } from "@atelier/supervisor";
import { requireWorkspaceAccess } from "../utils/authz";

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  const file = form?.find((part) => part.name === "file" && part.filename);
  const workspaceId = form?.find((part) => part.name === "workspaceId")?.data.toString();
  if (!file || !workspaceId) throw createError({ statusCode: 400 });
  const { workspace: ws } = requireWorkspaceAccess(event, workspaceId, "edit");
  try {
    assertUploadSize(file.data.length);
    const names = sanitizeUploadName(file.filename);
    const dir = join(ws.worktree, "var", "uploads");
    mkdirSync(dir, { recursive: true });
    const dest = resolveWorktreePath(ws.worktree, join("var", "uploads", names.storedName).split("\\").join("/"));
    writeFileSync(dest, file.data);
    return { path: dest, name: names.originalName, storedName: names.storedName };
  } catch (error) {
    const message = error instanceof UploadError || error instanceof Error ? error.message : "Upload failed";
    throw createError({ statusCode: 400, statusMessage: message });
  }
});
