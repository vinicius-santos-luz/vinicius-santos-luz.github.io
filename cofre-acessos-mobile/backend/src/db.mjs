import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";

const emptyDb = () => ({
  users: [],
  workspaces: [],
  workspaceMembers: [],
  vaultItems: [],
  auditLog: [],
});

let cache = null;

export async function loadDb() {
  if (cache) return cache;

  try {
    const raw = await readFile(config.dataFile, "utf8");
    cache = { ...emptyDb(), ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    cache = emptyDb();
    await saveDb(cache);
  }

  return cache;
}

export async function saveDb(db = cache) {
  await mkdir(dirname(config.dataFile), { recursive: true });
  const tempFile = `${config.dataFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(db, null, 2), "utf8");
  await rename(tempFile, config.dataFile);
  cache = db;
}

export async function withDb(mutator) {
  const db = await loadDb();
  const result = await mutator(db);
  await saveDb(db);
  return result;
}

export function now() {
  return new Date().toISOString();
}

export function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export function writeAudit(db, actorUserId, action, resource) {
  db.auditLog.push({
    id: id("audit"),
    actorUserId,
    action,
    resource,
    createdAt: now(),
  });
}
