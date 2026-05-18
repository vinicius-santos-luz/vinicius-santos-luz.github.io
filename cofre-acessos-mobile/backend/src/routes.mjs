import { hashPassword, signToken, verifyPassword } from "./crypto.mjs";
import { id, now, publicUser, withDb, writeAudit } from "./db.mjs";
import { HttpError, readJson, requireAuth, sendJson, sendNoContent } from "./http.mjs";
import { enumValue, optionalString, requiredObject, requiredString } from "./validators.mjs";

function memberFor(db, userId, workspaceId) {
  return db.workspaceMembers.find((member) => member.userId === userId && member.workspaceId === workspaceId);
}

function requireMember(db, userId, workspaceId) {
  const member = memberFor(db, userId, workspaceId);
  if (!member) throw new HttpError(403, "Sem acesso a este workspace.");
  return member;
}

function requireAdmin(db, userId, workspaceId) {
  const member = requireMember(db, userId, workspaceId);
  if (member.role !== "admin") throw new HttpError(403, "Somente administradores podem fazer isso.");
  return member;
}

function canAccessItem(db, user, item) {
  if (item.scope === "private") return item.ownerUserId === user.id;
  return Boolean(memberFor(db, user.id, item.workspaceId));
}

function canWriteItem(db, user, item) {
  if (item.scope === "private") return item.ownerUserId === user.id;
  const member = memberFor(db, user.id, item.workspaceId);
  return Boolean(member && ["admin", "editor"].includes(member.role));
}

function serializeItem(item) {
  return {
    id: item.id,
    scope: item.scope,
    ownerUserId: item.ownerUserId,
    workspaceId: item.workspaceId,
    encryptedData: item.encryptedData,
    metadata: item.metadata || {},
    syncEnabled: Boolean(item.syncEnabled),
    syncRole: item.syncRole || null,
    syncGroupId: item.syncGroupId || null,
    linkedItemId: item.linkedItemId || null,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function parseVaultPayload(body) {
  return {
    encryptedData: requiredObject(body.encryptedData, "encryptedData"),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
    syncEnabled: Boolean(body.syncEnabled),
    syncRole: body.syncRole || null,
    syncGroupId: body.syncGroupId || null,
    linkedItemId: body.linkedItemId || null,
  };
}

export async function handleRoutes(req, res, route) {
  if (route.method === "GET" && route.path === "/api/health") {
    sendJson(res, 200, { ok: true, name: "cofre-acessos-backend", time: now() });
    return true;
  }

  if (route.method === "POST" && route.path === "/api/auth/register") {
    const body = await readJson(req);
    const name = requiredString(body.name, "name");
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password", 10);
    const workspaceName = optionalString(body.workspaceName).trim() || "Minha empresa";

    const result = await withDb(async (db) => {
      if (db.users.some((user) => user.email === email)) {
        throw new HttpError(409, "Email ja cadastrado.");
      }

      const user = {
        id: id("user"),
        name,
        email,
        passwordHash: await hashPassword(password),
        createdAt: now(),
      };
      const workspace = {
        id: id("workspace"),
        name: workspaceName,
        createdBy: user.id,
        createdAt: now(),
      };
      const member = {
        id: id("member"),
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
        createdAt: now(),
      };

      db.users.push(user);
      db.workspaces.push(workspace);
      db.workspaceMembers.push(member);
      writeAudit(db, user.id, "auth.register", { userId: user.id, workspaceId: workspace.id });

      return {
        token: signToken({ sub: user.id }),
        user: publicUser(user),
        workspace,
      };
    });

    sendJson(res, 201, result);
    return true;
  }

  if (route.method === "POST" && route.path === "/api/auth/login") {
    const body = await readJson(req);
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password");

    const result = await withDb(async (db) => {
      const user = db.users.find((item) => item.email === email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new HttpError(401, "Email ou senha invalidos.");
      }

      const memberships = db.workspaceMembers
        .filter((member) => member.userId === user.id)
        .map((member) => ({
          ...member,
          workspace: db.workspaces.find((workspace) => workspace.id === member.workspaceId),
        }));

      writeAudit(db, user.id, "auth.login", { userId: user.id });
      return {
        token: signToken({ sub: user.id }),
        user: publicUser(user),
        memberships,
      };
    });

    sendJson(res, 200, result);
    return true;
  }

  if (route.method === "GET" && route.path === "/api/me") {
    const user = await requireAuth(req);
    const result = await withDb(async (db) => {
      const memberships = db.workspaceMembers
        .filter((member) => member.userId === user.id)
        .map((member) => ({
          ...member,
          workspace: db.workspaces.find((workspace) => workspace.id === member.workspaceId),
        }));
      return { user: publicUser(user), memberships };
    });
    sendJson(res, 200, result);
    return true;
  }

  if (route.method === "GET" && route.path === "/api/workspaces") {
    const user = await requireAuth(req);
    const result = await withDb(async (db) => ({
      workspaces: db.workspaceMembers
        .filter((member) => member.userId === user.id)
        .map((member) => ({
          id: member.workspaceId,
          role: member.role,
          workspace: db.workspaces.find((workspace) => workspace.id === member.workspaceId),
        })),
    }));
    sendJson(res, 200, result);
    return true;
  }

  const workspaceMembersMatch = route.path.match(/^\/api\/workspaces\/([^/]+)\/members$/);
  if (workspaceMembersMatch && route.method === "GET") {
    const user = await requireAuth(req);
    const workspaceId = workspaceMembersMatch[1];
    const result = await withDb(async (db) => {
      requireMember(db, user.id, workspaceId);
      return {
        members: db.workspaceMembers
          .filter((member) => member.workspaceId === workspaceId)
          .map((member) => ({ ...member, user: publicUser(db.users.find((item) => item.id === member.userId)) })),
      };
    });
    sendJson(res, 200, result);
    return true;
  }

  if (workspaceMembersMatch && route.method === "POST") {
    const user = await requireAuth(req);
    const workspaceId = workspaceMembersMatch[1];
    const body = await readJson(req);
    const email = requiredString(body.email, "email").toLowerCase();
    const role = enumValue(body.role || "viewer", "role", ["admin", "editor", "viewer"]);

    const result = await withDb(async (db) => {
      requireAdmin(db, user.id, workspaceId);
      const invited = db.users.find((item) => item.email === email);
      if (!invited) throw new HttpError(404, "Usuario convidado ainda nao existe. Cadastre o usuario primeiro.");

      const existing = memberFor(db, invited.id, workspaceId);
      if (existing) {
        existing.role = role;
        writeAudit(db, user.id, "workspace.member.update", { workspaceId, userId: invited.id, role });
        return { member: { ...existing, user: publicUser(invited) } };
      }

      const member = {
        id: id("member"),
        workspaceId,
        userId: invited.id,
        role,
        createdAt: now(),
      };
      db.workspaceMembers.push(member);
      writeAudit(db, user.id, "workspace.member.add", { workspaceId, userId: invited.id, role });
      return { member: { ...member, user: publicUser(invited) } };
    });

    sendJson(res, 201, result);
    return true;
  }

  if (route.method === "GET" && route.path === "/api/vault-items") {
    const user = await requireAuth(req);
    const scope = route.params.scope || "all";
    const workspaceId = route.params.workspaceId;

    const result = await withDb(async (db) => {
      let items = db.vaultItems.filter((item) => canAccessItem(db, user, item));
      if (scope !== "all") items = items.filter((item) => item.scope === scope);
      if (workspaceId) items = items.filter((item) => item.workspaceId === workspaceId);
      return { items: items.map(serializeItem) };
    });

    sendJson(res, 200, result);
    return true;
  }

  if (route.method === "POST" && route.path === "/api/vault-items") {
    const user = await requireAuth(req);
    const body = await readJson(req);
    const scope = enumValue(body.scope || "private", "scope", ["private", "shared"]);
    const payload = parseVaultPayload(body);

    const result = await withDb(async (db) => {
      const workspaceId = scope === "shared" ? requiredString(body.workspaceId, "workspaceId") : null;
      if (scope === "shared") {
        const member = requireMember(db, user.id, workspaceId);
        if (!["admin", "editor"].includes(member.role)) throw new HttpError(403, "Sem permissao para criar no compartilhado.");
      }

      const item = {
        id: id("item"),
        scope,
        ownerUserId: scope === "private" ? user.id : null,
        workspaceId,
        ...payload,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now(),
        updatedAt: now(),
      };

      db.vaultItems.push(item);
      writeAudit(db, user.id, "vault.item.create", { itemId: item.id, scope, workspaceId });
      return { item: serializeItem(item) };
    });

    sendJson(res, 201, result);
    return true;
  }

  const itemMatch = route.path.match(/^\/api\/vault-items\/([^/]+)$/);
  if (itemMatch && route.method === "GET") {
    const user = await requireAuth(req);
    const itemId = itemMatch[1];
    const result = await withDb(async (db) => {
      const item = db.vaultItems.find((candidate) => candidate.id === itemId);
      if (!item || !canAccessItem(db, user, item)) throw new HttpError(404, "Item nao encontrado.");
      return { item: serializeItem(item) };
    });
    sendJson(res, 200, result);
    return true;
  }

  if (itemMatch && route.method === "PUT") {
    const user = await requireAuth(req);
    const itemId = itemMatch[1];
    const body = await readJson(req);
    const payload = parseVaultPayload(body);

    const result = await withDb(async (db) => {
      const item = db.vaultItems.find((candidate) => candidate.id === itemId);
      if (!item || !canAccessItem(db, user, item)) throw new HttpError(404, "Item nao encontrado.");
      if (!canWriteItem(db, user, item)) throw new HttpError(403, "Sem permissao para editar este item.");

      Object.assign(item, payload, {
        updatedBy: user.id,
        updatedAt: now(),
      });

      writeAudit(db, user.id, "vault.item.update", { itemId: item.id, scope: item.scope, workspaceId: item.workspaceId });
      return { item: serializeItem(item) };
    });

    sendJson(res, 200, result);
    return true;
  }

  if (itemMatch && route.method === "DELETE") {
    const user = await requireAuth(req);
    const itemId = itemMatch[1];

    await withDb(async (db) => {
      const item = db.vaultItems.find((candidate) => candidate.id === itemId);
      if (!item || !canAccessItem(db, user, item)) throw new HttpError(404, "Item nao encontrado.");
      if (!canWriteItem(db, user, item)) throw new HttpError(403, "Sem permissao para excluir este item.");

      db.vaultItems = db.vaultItems.filter((candidate) => candidate.id !== itemId);
      writeAudit(db, user.id, "vault.item.delete", { itemId, scope: item.scope, workspaceId: item.workspaceId });
    });

    sendNoContent(res);
    return true;
  }

  if (route.method === "GET" && route.path === "/api/audit-log") {
    const user = await requireAuth(req);
    const workspaceId = route.params.workspaceId;
    const result = await withDb(async (db) => {
      if (workspaceId) requireMember(db, user.id, workspaceId);
      const allowedWorkspaceIds = db.workspaceMembers
        .filter((member) => member.userId === user.id)
        .map((member) => member.workspaceId);
      const events = db.auditLog.filter((event) => {
        if (event.actorUserId === user.id) return true;
        const resourceWorkspaceId = event.resource?.workspaceId;
        return resourceWorkspaceId && allowedWorkspaceIds.includes(resourceWorkspaceId);
      });
      return { events: events.slice(-200).reverse() };
    });
    sendJson(res, 200, result);
    return true;
  }

  return false;
}
