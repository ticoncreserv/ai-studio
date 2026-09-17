const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".pdf",
  ".vue",
  ".php",
  ".ts",
  ".tsx",
]);

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export function sanitizeUploadName(filename: string | undefined): { storedName: string; originalName: string } {
  const original = (filename ?? "upload.bin").split(/[/\\]/).pop()?.trim() || "upload.bin";
  if (!original || original === "." || original === ".." || original.includes("\0")) {
    throw new UploadError("Invalid upload filename");
  }
  const dot = original.lastIndexOf(".");
  const ext = (dot >= 0 ? original.slice(dot) : "").toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new UploadError("Upload file type is not allowed");
  }
  const storedName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${ext || ".bin"}`;
  return { storedName, originalName: original };
}

export function assertUploadSize(bytes: number, max = MAX_UPLOAD_BYTES): void {
  if (bytes <= 0 || bytes > max) throw new UploadError("Upload exceeds the size limit");
}

export const uploadMaxBytes = MAX_UPLOAD_BYTES;
