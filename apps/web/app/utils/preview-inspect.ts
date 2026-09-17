export type PreviewInspectTarget = {
  tag: string;
  selector: string;
  xpath: string;
  page?: string;
  component?: string;
  role?: string;
  name?: string;
  text?: string;
  href?: string;
  testId?: string;
};

const IGNORE_IDS = new Set(["atelier-preview-wait", "phpdebugbar"]);
const IGNORE_ID_PREFIX = "phpdebugbar";
const CONTROL_SELECTOR = "button, a, summary, input, textarea, select, [role='button'], [role='link'], [role='checkbox']";

export function isIgnoredInspectNode(el: Element | null | undefined): boolean {
  if (!el || el === el.ownerDocument?.documentElement || el === el.ownerDocument?.body) return false;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") return true;
  if (el.id && (IGNORE_IDS.has(el.id) || el.id.startsWith(IGNORE_ID_PREFIX))) return true;
  const className = typeof el.className === "string" ? el.className : "";
  if (className.includes("phpdebugbar")) return true;
  return Boolean(el.closest?.("#atelier-preview-wait, #phpdebugbar, .phpdebugbar"));
}

export function preferredInspectNode(el: Element | null | undefined): Element | null {
  if (!el || isIgnoredInspectNode(el)) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body") return el;
  if (tag === "svg" || tag === "path" || tag === "use" || tag === "g") {
    const control = el.closest(CONTROL_SELECTOR);
    if (control && !isIgnoredInspectNode(control)) return control;
    return el.closest("svg") ?? el;
  }
  return el;
}

function attr(el: Element, name: string): string {
  return (el.getAttribute(name) ?? "").trim();
}

function cssEscapeIdent(value: string): string {
  return value.replace(/([^\w-])/g, "\\$1");
}

function uniqueNth(el: Element): string {
  const parent = el.parentElement;
  if (!parent) return "";
  const tag = el.tagName;
  const same = [...parent.children].filter((child) => child.tagName === tag);
  if (same.length < 2) return "";
  return `:nth-of-type(${same.indexOf(el) + 1})`;
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== "HTML" && node.tagName !== "BODY") {
    const tag = node.tagName.toLowerCase();
    const id = node.id && /^[A-Za-z][\w-]*$/.test(node.id) ? node.id : "";
    if (id) {
      parts.unshift(`#${cssEscapeIdent(id)}`);
      break;
    }
    const testId = attr(node, "data-test") || attr(node, "data-testid");
    if (testId) {
      parts.unshift(`${tag}[data-test="${testId.replace(/"/g, '\\"')}"]`);
      break;
    }
    const name = attr(node, "name");
    if (name && /^(input|select|textarea|button)$/.test(tag)) {
      parts.unshift(`${tag}[name="${name.replace(/"/g, '\\"')}"]`);
      break;
    }
    parts.unshift(`${tag}${uniqueNth(node)}`);
    node = node.parentElement;
    if (parts.length >= 6) break;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

export function xpathFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(`/${tag}`);
      break;
    }
    const same = [...parent.children].filter((child) => child.tagName === node!.tagName);
    const index = same.indexOf(node) + 1;
    parts.unshift(same.length > 1 ? `${tag}[${index}]` : tag);
    node = parent;
  }
  return `/${parts.join("/")}`;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Sibling labels in a wrapper (checkbox + “forgot password”) stay readable. */
export function joinInspectTexts(pieces: string[]): string {
  return pieces.map(compactText).filter(Boolean).join(" · ").slice(0, 80);
}

export function inspectTextPieces(el: Element): string[] {
  const kids = [...el.children].filter((child) => child.tagName !== "SCRIPT" && child.tagName !== "STYLE");
  const fromKids = kids.map((child) => compactText(child.textContent ?? "")).filter(Boolean);
  if (fromKids.length > 1) return fromKids;
  if (kids.length === 1) return inspectTextPieces(kids[0]!);
  const own = compactText(el.textContent ?? "");
  return own ? [own] : [];
}

function inspectVisibleText(el: Element): string {
  return joinInspectTexts(inspectTextPieces(el));
}

function accessibleName(el: Element): string {
  return (
    attr(el, "aria-label") ||
    attr(el, "title") ||
    attr(el, "alt") ||
    attr(el, "placeholder") ||
    ("value" in el && typeof (el as { value?: unknown }).value === "string" ? String((el as { value: string }).value).trim() : "") ||
    inspectVisibleText(el)
  ).slice(0, 80);
}

function vueComponentName(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    const inst = (node as { __vueParentComponent?: { type?: { __name?: string; name?: string; __file?: string } } })
      .__vueParentComponent;
    const type = inst?.type;
    const name = type?.__name || type?.name;
    if (name && name !== "Anonymous" && name !== "AsyncComponentWrapper") return name;
    const file = type?.__file;
    if (file) {
      const leaf = file.split(/[\\/]/).pop()?.replace(/\.\w+$/, "");
      if (leaf) return leaf;
    }
    node = node.parentElement;
  }
  return undefined;
}

export function describeInspectElement(el: Element, page?: string): PreviewInspectTarget {
  const tag = el.tagName.toLowerCase();
  const name = accessibleName(el);
  const text = inspectVisibleText(el);
  const href = attr(el, "href") || (el instanceof HTMLAnchorElement ? el.getAttribute("href") ?? "" : "");
  const testId = attr(el, "data-test") || attr(el, "data-testid");
  const role = attr(el, "role") || undefined;
  return {
    tag,
    selector: cssPath(el),
    xpath: xpathFor(el),
    page,
    component: vueComponentName(el),
    role,
    name: name || undefined,
    text: text && text !== name ? text : name || undefined,
    href: href || undefined,
    testId: testId || undefined,
  };
}

export function inspectLabel(target: PreviewInspectTarget): string {
  const name = target.name || target.testId;
  return name ? `${target.tag} “${name}”` : target.tag;
}

export const INSPECT_TOOLTIP_HEIGHT = 22;
export const INSPECT_TOOLTIP_GAP = 8;

export function inspectTooltipPosition(box: { left: number; top: number; height: number }): { left: number; top: number } {
  const left = Math.max(0, box.left);
  const above = box.top - INSPECT_TOOLTIP_HEIGHT - INSPECT_TOOLTIP_GAP;
  return {
    left,
    top: above >= 0 ? above : box.top + box.height + INSPECT_TOOLTIP_GAP,
  };
}

export function inspectChipLabel(target: PreviewInspectTarget): string {
  return target.component || target.name || target.testId || target.tag;
}

export function toInspectPin(target: PreviewInspectTarget): { label: string; note: string } {
  return { label: inspectChipLabel(target), note: formatInspectNote(target).trim() };
}

export const MAX_INSPECT_PINS = 8;

export function mergeInspectPins(
  current: Array<{ label: string; note: string }>,
  incoming: Array<{ label: string; note: string }>,
): Array<{ label: string; note: string }> {
  const next = [...current];
  for (const pin of incoming) {
    if (next.some((row) => row.note === pin.note)) continue;
    next.push(pin);
  }
  return next.slice(-MAX_INSPECT_PINS);
}

function noteLines(target: PreviewInspectTarget): string[] {
  const lines = [
    `- selector: ${target.selector}`,
    `- xpath: ${target.xpath}`,
    `- tag: ${target.tag}`,
  ];
  if (target.page) lines.push(`- page: ${target.page}`);
  if (target.component) lines.push(`- component: ${target.component}`);
  if (target.role) lines.push(`- role: ${target.role}`);
  if (target.testId) lines.push(`- data-test: ${target.testId}`);
  if (target.name) lines.push(`- name: ${target.name}`);
  if (target.href) lines.push(`- href: ${target.href}`);
  if (target.text && target.text !== target.name) lines.push(`- text: ${target.text}`);
  return lines;
}

export function formatInspectNote(target: PreviewInspectTarget): string {
  return `${noteLines(target).join("\n")}\n`;
}

export function formatInspectRegionNote(targets: PreviewInspectTarget[]): string {
  if (!targets.length) return "";
  return targets.slice(0, MAX_INSPECT_PINS).map((target) => formatInspectNote(target)).join("\n");
}

export function hitInspectElement(doc: Document | null | undefined, x: number, y: number): Element | null {
  if (!doc) return null;
  const raw = doc.elementFromPoint(x, y);
  return preferredInspectNode(raw);
}

export function elementsInInspectRect(doc: Document, box: { left: number; top: number; right: number; bottom: number }): Element[] {
  const seen = new Set<Element>();
  const found: Element[] = [];
  const xs = [box.left + 4, (box.left + box.right) / 2, box.right - 4];
  const ys = [box.top + 4, (box.top + box.bottom) / 2, box.bottom - 4];
  for (const x of xs) {
    for (const y of ys) {
      const hit = hitInspectElement(doc, x, y);
      if (!hit || seen.has(hit) || hit.tagName === "HTML" || hit.tagName === "BODY") continue;
      seen.add(hit);
      found.push(hit);
    }
  }
  return found;
}
