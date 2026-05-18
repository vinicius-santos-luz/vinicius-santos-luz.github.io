import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = await mkdtemp(join(tmpdir(), "cofre-api-"));
const port = 8899;

const server = spawn(process.execPath, ["src/server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_FILE: join(tempDir, "db.json"),
    JWT_SECRET: "test-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

async function request(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return json;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await request("/api/health");
      if (health.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Servidor nao iniciou.");
}

try {
  await waitForServer();

  const admin = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Admin",
      email: "admin@empresa.test",
      password: "SenhaForte123!",
      workspaceName: "Empresa Teste",
    },
  });
  assert.ok(admin.token);
  assert.equal(admin.workspace.name, "Empresa Teste");

  const employee = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Funcionario",
      email: "funcionario@empresa.test",
      password: "SenhaForte123!",
      workspaceName: "Pessoal",
    },
  });
  assert.ok(employee.token);

  const privateItem = await request("/api/vault-items", {
    method: "POST",
    token: admin.token,
    body: {
      scope: "private",
      encryptedData: { iv: "iv", data: "privado" },
      metadata: { title: "Banco privado" },
    },
  });
  assert.equal(privateItem.item.scope, "private");

  const sharedItem = await request("/api/vault-items", {
    method: "POST",
    token: admin.token,
    body: {
      scope: "shared",
      workspaceId: admin.workspace.id,
      encryptedData: { iv: "iv", data: "compartilhado" },
      metadata: { title: "Sistema empresa" },
    },
  });
  assert.equal(sharedItem.item.scope, "shared");

  await request(`/api/workspaces/${admin.workspace.id}/members`, {
    method: "POST",
    token: admin.token,
    body: {
      email: "funcionario@empresa.test",
      role: "viewer",
    },
  });

  const employeeItems = await request(`/api/vault-items?scope=all&workspaceId=${admin.workspace.id}`, {
    token: employee.token,
  });
  assert.equal(employeeItems.items.length, 1);
  assert.equal(employeeItems.items[0].id, sharedItem.item.id);

  const adminItems = await request("/api/vault-items?scope=all", {
    token: admin.token,
  });
  assert.equal(adminItems.items.length, 2);

  const audit = await request("/api/audit-log", {
    token: admin.token,
  });
  assert.ok(audit.events.length >= 4);

  console.log("API test ok");
} finally {
  server.kill();
  await rm(tempDir, { recursive: true, force: true });
}
