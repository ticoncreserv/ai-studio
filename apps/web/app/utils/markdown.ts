export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source);
  const parts = escaped.split(/```([\s\S]*?)```/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        const newline = part.indexOf("\n");
        const code = newline >= 0 ? part.slice(newline + 1) : part;
        return `<pre><code>${code.trim()}</code></pre>`;
      }
      return part
        .replaceAll(/^### (.+)$/gm, "<h3>$1</h3>")
        .replaceAll(/^## (.+)$/gm, "<h3>$1</h3>")
        .replaceAll(/^# (.+)$/gm, "<h3>$1</h3>")
        .replaceAll(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replaceAll(/`([^`]+)`/g, "<code>$1</code>")
        .replaceAll(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
        .replaceAll(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
        .split(/\n{2,}/)
        .map((block) => (block.startsWith("<") ? block : `<p>${block.replaceAll("\n", "<br>")}</p>`))
        .join("");
    })
    .join("");
}

export function splitDiffLines(oldLines: string, newLines: string): Array<{ kind: "del" | "add" | "ctx"; text: string }> {
  const removed = oldLines.split("\n").filter((line, i, arr) => !(i === arr.length - 1 && line === ""));
  const added = newLines.split("\n").filter((line, i, arr) => !(i === arr.length - 1 && line === ""));
  const rows: Array<{ kind: "del" | "add" | "ctx"; text: string }> = [];
  for (const line of removed) rows.push({ kind: "del", text: line || " " });
  for (const line of added) rows.push({ kind: "add", text: line || " " });
  if (!rows.length) rows.push({ kind: "ctx", text: " " });
  return rows;
}
