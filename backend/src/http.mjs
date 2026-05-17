import { config } from "./config.mjs";
import { loadDb } from "./db.mjs";
import { verifyToken } from "./crypto.mjs";

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON invalido.");
  }
}

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": config.corsOrigin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res) {
  res.writeHead(204, {
    "access-control-allow-origin": config.corsOrigin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end();
}

export async function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload?.sub) throw new HttpError(401, "Login necessario.");

  const db = await loadDb();
  const user = db.users.find((item) => item.id === payload.sub);
  if (!user) throw new HttpError(401, "Usuario nao encontrado.");
  return user;
}

export function routeKey(reqUrl, method) {
  const url = new URL(reqUrl, "http://localhost");
  return {
    method,
    path: url.pathname,
    params: Object.fromEntries(url.searchParams.entries()),
  };
}
