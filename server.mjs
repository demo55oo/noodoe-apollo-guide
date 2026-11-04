/**
 * Serves the Noodoe Apollo guide and runs the monthly buyer pipeline on demand.
 * n8n Schedule → POST /apollo/run with Authorization: Bearer <RUN_SECRET>
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const RUN_SECRET = String(process.env.NOODOE_APOLLO_RUN_SECRET || "").trim();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

let running = null;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function authorize(req) {
  if (!RUN_SECRET) return false;
  const header = String(req.headers.authorization || "");
  return header === "Bearer " + RUN_SECRET;
}

function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(__dirname, filePath);
  if (!abs.startsWith(__dirname) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return send(res, 404, "Not found");
  }
  const ext = path.extname(abs);
  send(res, 200, fs.readFileSync(abs), MIME[ext] || "application/octet-stream");
}

function startRun(cap = 8360) {
  if (running) {
    return { started: false, reason: "already_running", pid: running.pid };
  }
  const child = spawn(
    process.execPath,
    ["apollo/run-monthly.mjs", "--cap", String(cap), "--write"],
    {
      cwd: __dirname,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs = [];
  const pushLog = (buf) => {
    const text = buf.toString("utf8");
    logs.push(text);
    if (logs.length > 200) logs.shift();
    process.stdout.write(text);
  };
  child.stdout.on("data", pushLog);
  child.stderr.on("data", pushLog);
  child.on("exit", (code) => {
    running = null;
    process.stdout.write(`apollo-run exited code=${code}\n`);
  });
  running = { pid: child.pid, startedAt: new Date().toISOString(), logs, child };
  return { started: true, pid: child.pid, cap };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, running: Boolean(running), service: "noodoe-apollo-guide" }, "application/json");
  }

  if (req.method === "GET" && url.pathname === "/apollo/status") {
    if (!authorize(req)) return send(res, 401, { ok: false, error: "unauthorized" }, "application/json");
    return send(res, 200, {
      ok: true,
      running: Boolean(running),
      pid: running?.pid || null,
      startedAt: running?.startedAt || null,
      tail: running ? running.logs.slice(-20).join("") : "",
    }, "application/json");
  }

  if (req.method === "POST" && url.pathname === "/apollo/run") {
    if (!authorize(req)) return send(res, 401, { ok: false, error: "unauthorized" }, "application/json");
    // Half of Apollo Professional (16,720) so 1st and 15th each take ~half the cycle.
    const HALF_CYCLE = 8360;
    let cap = HALF_CYCLE;
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        const body = JSON.parse(raw);
        if (body.cap) cap = Math.max(1, Math.min(HALF_CYCLE, Number(body.cap) || HALF_CYCLE));
      }
    } catch {
      // default half-cycle cap
    }
    const result = startRun(cap);
    return send(res, result.started ? 202 : 409, {
      ok: result.started,
      ...result,
      note: "Pipeline runs asynchronously on this service. n8n only triggers it.",
    }, "application/json");
  }

  if (req.method === "GET") return serveStatic(req, res);
  return send(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`noodoe apollo guide+runner on :${PORT}`);
});
