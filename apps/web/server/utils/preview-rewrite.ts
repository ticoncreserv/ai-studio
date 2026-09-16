export function rewriteSetCookie(value: string, cookiePath: string): string {
  if (/;\s*path=/i.test(value)) return value.replace(/;\s*path=[^;]*/i, `; Path=${cookiePath}`);
  return `${value}; Path=${cookiePath}`;
}

export function rewriteLocation(location: string, port: number, prefix: string): string {
  return location
    .replaceAll(`http://127.0.0.1:${port}`, prefix)
    .replaceAll(`http://localhost:${port}`, prefix);
}
