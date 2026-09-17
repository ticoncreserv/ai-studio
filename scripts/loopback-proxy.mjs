#!/usr/bin/env node
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { execFileSync } from "node:child_process";

const TARGET = Number(process.env.NUXT_PORT || process.env.PORT || 43123);
const PORTS = (process.env.ATELIER_LOOPBACK_PORTS || "80,8080")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const CALLBACK_PATHS = [
  "/api/auth/github/callback",
  "/auth/github/callback",
  "/api/github/callback",
  "/github/callback",
  "/api/setup/github/callback",
  "/setup/github/callback",
];

function pathnameOf(url) {
  try {
    return new URL(url || "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function isGitHubCallback(pathname) {
  return CALLBACK_PATHS.some((path) => pathname === path);
}

function tryUnprivileged(port) {
  if (port >= 1024) return;
  try {
    execFileSync("sudo", ["-n", "sysctl", "-w", `net.ipv4.ip_unprivileged_port_start=${Math.min(port, 80)}`], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    // Privilege not available; bind or iptables may still work.
  }
}

function ensureRedirect(bin, chain, dest, fromPort, toPort) {
  const body = dest
    ? ["-p", "tcp", "-d", dest, "--dport", String(fromPort), "-j", "REDIRECT", "--to-ports", String(toPort)]
    : ["-p", "tcp", "--dport", String(fromPort), "-j", "REDIRECT", "--to-ports", String(toPort)];
  try {
    execFileSync("sudo", ["-n", bin, "-t", "nat", "-C", chain, ...body], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    try {
      execFileSync("sudo", ["-n", bin, "-t", "nat", "-A", chain, ...body], { stdio: ["ignore", "ignore", "ignore"] });
      return true;
    } catch {
      return false;
    }
  }
}

function tryIptablesRedirect(fromPort, toPort) {
  const v4 =
    ensureRedirect("iptables", "OUTPUT", "127.0.0.1", fromPort, toPort) ||
    ensureRedirect("iptables", "PREROUTING", "", fromPort, toPort);
  const v6 = ensureRedirect("ip6tables", "OUTPUT", "::1", fromPort, toPort);
  return Boolean(v4 || v6);
}

function studioLocation(req) {
  return `http://127.0.0.1:${TARGET}${req.url || "/"}`;
}

function proxyRequest(req, res) {
  const pathname = pathnameOf(req.url);
  if (isGitHubCallback(pathname)) {
    res.writeHead(302, { Location: studioLocation(req) });
    res.end();
    return;
  }

  const headers = { ...req.headers };
  headers["x-forwarded-host"] = req.headers.host || "localhost";
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-port"] = String(req.socket.localPort || 80);
  headers.host = `127.0.0.1:${TARGET}`;

  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: TARGET,
      path: req.url,
      method: req.method,
      headers,
    },
    (incoming) => {
      incoming.on("error", fail);
      res.writeHead(incoming.statusCode || 502, incoming.headers);
      incoming.pipe(res);
    },
  );

  function fail() {
    upstream.destroy();
    if (req.destroyed || res.writableEnded) return;
    if (!res.headersSent) res.writeHead(302, { Location: studioLocation(req) });
    res.end();
  }

  upstream.on("error", fail);
  req.on("error", fail);
  res.on("error", () => upstream.destroy());
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
  socket.on("error", () => socket.destroy());
  const upstream = createConnection({ port: TARGET, host: "127.0.0.1" }, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${key}: ${item}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push("", "");
    upstream.write(lines.join("\r\n"));
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
}

function listenPort(port) {
  return new Promise((resolve) => {
    const server = createServer(proxyRequest);
    server.on("upgrade", proxyUpgrade);
    const fail = () => resolve(false);
    server.once("error", fail);
    server.listen({ port, host: "0.0.0.0" }, () => {
      server.off("error", fail);
      console.info(`[loopback] :${port} → 127.0.0.1:${TARGET}`);
      resolve(true);
    });
  });
}

export async function startLoopbackProxy({ targetPort = TARGET, ports = PORTS } = {}) {
  const listened = [];
  for (const port of ports) {
    tryUnprivileged(port);
    const bound = await listenPort(port);
    if (bound) {
      listened.push(port);
      continue;
    }
    if (port < 1024 && tryIptablesRedirect(port, targetPort)) {
      console.info(`[loopback] redirected :${port} → :${targetPort}`);
      listened.push(port);
    } else {
      console.warn(`[loopback] could not listen on :${port}`);
    }
  }
  return listened;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startLoopbackProxy();
}
