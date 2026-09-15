#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.PORT || 45401);
const worktree = process.env.WORKTREE || join(process.cwd(), "fixtures/laravel-app");
const cookie = process.env.SESSION_COOKIE || "atelier_preview_session";

const quotes = [
  { id: 1042, customer: "Construtora Horizonte", total: "R$ 48.200", status: "Approved" },
  { id: 1043, customer: "Obra Vila Nova", total: "R$ 12.780", status: "Draft" },
  { id: 1044, customer: "Concreto Sul", total: "R$ 91.040", status: "Sent" },
];
const customers = [
  { id: 1, name: "Construtora Horizonte", city: "Campinas" },
  { id: 2, name: "Obra Vila Nova", city: "Jundiaí" },
];

function pageExists(rel) {
  return existsSync(join(worktree, rel));
}

function pageTitle(pathname) {
  if (pathname.startsWith("/quotes") && pageExists("resources/js/Pages/Quotes/Index.vue")) return "Quotes";
  if (pathname.startsWith("/customers") && pageExists("resources/js/Pages/Customers/Index.vue")) return "Customers";
  return "Ready-mix portal";
}

function body(pathname) {
  if (pathname === "/up") return null;
  if (pathname.startsWith("/quotes")) {
    const rows = quotes
      .map((q) => `<tr><td>${q.customer}</td><td>${q.total}</td><td><span class="pill">${q.status}</span></td></tr>`)
      .join("");
    return `
      <h1>Quotes</h1>
      <p class="lead">Homologation board for plant 12. Accept a generated hunk to replace this page from the worktree.</p>
      <table>
        <thead><tr><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  if (pathname.startsWith("/customers")) {
    return `
      <h1>Customers</h1>
      <ul class="list">${customers.map((c) => `<li><strong>${c.name}</strong><span>${c.city}</span></li>`).join("")}</ul>`;
  }
  return `
    <p class="kicker">Concreserv homologation</p>
    <h1>Ready-mix portal</h1>
    <p class="lead">Preview workspace for quotes, customers, and deliveries. This fixture stands in for ticoncreserv/app until GitHub App secrets exist.</p>
    <div class="cards">
      <a class="card" href="/quotes"><strong>Quotes</strong><span>Open the commercial board</span></a>
      <a class="card" href="/customers"><strong>Customers</strong><span>Plant accounts in Campinas</span></a>
    </div>`;
}

function html(pathname) {
  const debug = JSON.stringify({
    timeMs: 42,
    memoryMb: 28,
    queries: 3,
    nPlusOne: 0,
    longQuery: false,
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle(pathname)} · Atelier preview</title>
  <style>
    :root { color-scheme: light; --ink:#14202b; --muted:#5c6b78; --line:#d7dee5; --bg:#f4f1ea; --paper:#fffdf8; --accent:#c45c26; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, serif; background: var(--bg); color: var(--ink); }
    header { display:flex; justify-content:space-between; align-items:center; padding:18px 28px; border-bottom:1px solid var(--line); background:var(--paper); }
    header a { color: var(--ink); text-decoration:none; margin-right:16px; font-size:15px; }
    main { padding:36px 28px 80px; max-width:860px; }
    h1 { font-size:40px; margin:0 0 12px; letter-spacing:-0.03em; }
    .kicker { text-transform:uppercase; letter-spacing:0.14em; font-size:12px; color:var(--accent); margin:0 0 8px; }
    .lead { color:var(--muted); font-size:18px; line-height:1.5; }
    table { width:100%; border-collapse:collapse; background:var(--paper); }
    th, td { text-align:left; padding:12px 14px; border-bottom:1px solid var(--line); }
    .pill { font-size:12px; border:1px solid var(--line); padding:2px 8px; border-radius:999px; }
    .cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:28px; }
    .card { display:flex; flex-direction:column; gap:6px; padding:18px; background:var(--paper); border:1px solid var(--line); text-decoration:none; color:inherit; }
    .list { list-style:none; padding:0; }
    .list li { display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--line); }
    #inspector-overlay { position:fixed; right:16px; bottom:16px; background:#14202b; color:#f4f1ea; padding:10px 12px; font:12px/1.4 ui-sans-serif, system-ui; border-radius:8px; }
  </style>
</head>
<body>
  <header>
    <nav>
      <a href="/">Portal</a>
      <a href="/quotes">Quotes</a>
      <a href="/customers">Customers</a>
    </nav>
    <span>Plant 12 · homologation</span>
  </header>
  <main>${body(pathname)}</main>
  <div id="inspector-overlay" data-debug='${debug}'>42ms · 3 queries · 28 MB</div>
  <script>
    window.addEventListener('error', (event) => {
      parent.postMessage({ type: 'atelier-preview-error', source: 'console', message: event.message }, '*');
    });
    const orig = window.fetch;
    window.fetch = async (...args) => {
      try {
        const res = await orig(...args);
        if (!res.ok) parent.postMessage({ type: 'atelier-preview-error', source: 'network', message: res.status + ' ' + args[0] }, '*');
        return res;
      } catch (error) {
        parent.postMessage({ type: 'atelier-preview-error', source: 'network', message: String(error) }, '*');
        throw error;
      }
    };
  </script>
</body>
</html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Set-Cookie", `${cookie}=preview; Path=/; SameSite=Lax`);
  if (url.pathname === "/up") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  if (url.pathname === "/debug.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ timeMs: 42, memoryMb: 28, queries: 3, nPlusOne: 0, longQuery: false }));
    return;
  }
  if (url.pathname === "/__vite_hmr") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hmr-ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html(url.pathname));
});

try {
  watch(join(worktree, "resources"), { recursive: true }, () => undefined);
} catch {
  // Fixture may not have a resources tree yet.
}

server.listen(port, "127.0.0.1", () => {
  console.info(`[preview] ${worktree} on http://127.0.0.1:${port}`);
});
