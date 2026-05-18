const STORAGE_KEY = "cofre-acessos-v1";
const SESSION_KEY = "cofre-acessos-api-session-v1";
const API_BASE_KEY = "cofre-acessos-api-base-v1";
const KDF_ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  masterKey: null,
  store: null,
  entries: [],
  activeId: null,
  filter: "all",
  query: "",
  vaultScope: "private",
  authMode: "login",
  apiBaseUrl: localStorage.getItem(API_BASE_KEY) || "http://127.0.0.1:8787",
  token: null,
  user: null,
  workspace: null,
  remoteMode: false,
  masterPassword: "",
  lockTimer: null,
};

const $ = (id) => document.getElementById(id);

const elements = {
  lockedView: $("lockedView"),
  vaultView: $("vaultView"),
  vaultStatus: $("vaultStatus"),
  authForm: $("authForm"),
  loginModeButton: $("loginModeButton"),
  registerModeButton: $("registerModeButton"),
  apiBaseUrl: $("apiBaseUrl"),
  userName: $("userName"),
  nameLabel: $("nameLabel"),
  userEmail: $("userEmail"),
  workspaceName: $("workspaceName"),
  workspaceLabel: $("workspaceLabel"),
  masterPassword: $("masterPassword"),
  confirmPassword: $("confirmPassword"),
  confirmLabel: $("confirmLabel"),
  authButton: $("authButton"),
  authMessage: $("authMessage"),
  toggleMaster: $("toggleMaster"),
  entryCount: $("entryCount"),
  syncButton: $("syncButton"),
  exportButton: $("exportButton"),
  importFile: $("importFile"),
  installButton: $("installButton"),
  lockButton: $("lockButton"),
  showListButton: $("showListButton"),
  showFormButton: $("showFormButton"),
  privateVaultButton: $("privateVaultButton"),
  sharedVaultButton: $("sharedVaultButton"),
  searchInput: $("searchInput"),
  entryList: $("entryList"),
  entryForm: $("entryForm"),
  formTitle: $("formTitle"),
  lastUpdated: $("lastUpdated"),
  newButton: $("newButton"),
  shareButton: $("shareButton"),
  stopSyncButton: $("stopSyncButton"),
  mobileNewButton: $("mobileNewButton"),
  deleteButton: $("deleteButton"),
  syncPanel: $("syncPanel"),
  syncTitle: $("syncTitle"),
  syncDescription: $("syncDescription"),
  entryType: $("entryType"),
  entryTitle: $("entryTitle"),
  entryLogin: $("entryLogin"),
  entryEmail: $("entryEmail"),
  entryPassword: $("entryPassword"),
  toggleEntryPassword: $("toggleEntryPassword"),
  copyPassword: $("copyPassword"),
  generatePassword: $("generatePassword"),
  entryAgency: $("entryAgency"),
  entryAccount: $("entryAccount"),
  entryUrl: $("entryUrl"),
  entryPhone: $("entryPhone"),
  entryNotes: $("entryNotes"),
  saveMessage: $("saveMessage"),
};

let deferredInstallPrompt = null;

function bytesToBase64(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveRemoteKey(password, userId, workspaceId = "") {
  const scope = workspaceId ? `shared:${workspaceId}` : `private:${userId}`;
  return deriveKey(password, encoder.encode(`cofre-acessos:${scope}`));
}

async function encryptJson(key, payload) {
  const iv = randomBytes(12);
  const data = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
}

async function decryptJson(key, box) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(box.iv) },
    key,
    base64ToBytes(box.data)
  );
  return JSON.parse(decoder.decode(decrypted));
}

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getApiBaseUrl() {
  return elements.apiBaseUrl.value.trim().replace(/\/$/, "");
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error || "Erro na API.");
  }
  return data;
}

function hasVault() {
  return Boolean(loadStore());
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function setMobileScreen(screen) {
  elements.vaultView.dataset.mobileScreen = screen;
  elements.showListButton.classList.toggle("active", screen === "list");
  elements.showFormButton.classList.toggle("active", screen === "form");
}

function setVaultScope(scope) {
  state.vaultScope = scope;
  elements.privateVaultButton.classList.toggle("active", scope === "private");
  elements.sharedVaultButton.classList.toggle("active", scope === "shared");
  resetForm();
  renderEntries();
}

function normalizeEntry(entry) {
  return {
    ...entry,
    remoteId: entry.remoteId || null,
    scope: entry.scope || "private",
    syncEnabled: Boolean(entry.syncEnabled),
    syncRole: entry.syncRole || null,
    syncGroupId: entry.syncGroupId || null,
    linkedItemId: entry.linkedItemId || null,
  };
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  elements.loginModeButton.classList.toggle("active", !isRegister);
  elements.registerModeButton.classList.toggle("active", isRegister);
  elements.userName.classList.toggle("hidden", !isRegister);
  elements.nameLabel.classList.toggle("hidden", !isRegister);
  elements.workspaceName.classList.toggle("hidden", !isRegister);
  elements.workspaceLabel.classList.toggle("hidden", !isRegister);
  elements.confirmPassword.classList.toggle("hidden", !isRegister);
  elements.confirmLabel.classList.toggle("hidden", !isRegister);
  elements.userName.required = isRegister;
  elements.workspaceName.required = isRegister;
  elements.confirmPassword.required = isRegister;
  elements.authButton.textContent = isRegister ? "Cadastrar e entrar" : "Entrar";
  elements.vaultStatus.textContent = isRegister ? "Criar acesso online" : "Entrar no cofre online";
  setMessage(elements.authMessage, "");
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function resetLockTimer() {
  clearTimeout(state.lockTimer);
  state.lockTimer = setTimeout(lockVault, 5 * 60 * 1000);
}

async function createVault(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const now = new Date().toISOString();
  const store = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    verifier: await encryptJson(key, { ok: true }),
    vault: await encryptJson(key, { entries: [], createdAt: now, updatedAt: now }),
  };
  saveStore(store);
  state.masterKey = key;
  state.store = store;
  state.entries = [];
  unlockView();
}

async function unlockVault(password) {
  const store = loadStore();
  const key = await deriveKey(password, base64ToBytes(store.salt));
  await decryptJson(key, store.verifier);
  const vault = await decryptJson(key, store.vault);
  state.masterKey = key;
  state.store = store;
  state.entries = Array.isArray(vault.entries) ? vault.entries.map(normalizeEntry) : [];
  unlockView();
}

async function authenticateOnline(password) {
  state.apiBaseUrl = getApiBaseUrl();
  localStorage.setItem(API_BASE_KEY, state.apiBaseUrl);
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  const body = state.authMode === "register"
    ? {
        name: elements.userName.value.trim(),
        email: elements.userEmail.value.trim(),
        password,
        workspaceName: elements.workspaceName.value.trim() || "Minha empresa",
      }
    : {
        email: elements.userEmail.value.trim(),
        password,
      };

  const auth = await apiFetch(endpoint, { method: "POST", body });
  state.token = auth.token;
  state.user = auth.user;
  state.workspace = auth.workspace || auth.memberships?.[0]?.workspace;
  if (!state.workspace) throw new Error("Nenhum workspace encontrado para este usuario.");

  state.remoteMode = true;
  state.masterPassword = password;
  saveSession({
    token: state.token,
    user: state.user,
    workspace: state.workspace,
    apiBaseUrl: state.apiBaseUrl,
  });
  await loadEntriesFromApi();
  unlockView();
}

async function persistEntries() {
  const now = new Date().toISOString();
  if (state.store) {
    state.store.vault = await encryptJson(state.masterKey, { entries: state.entries, updatedAt: now });
    saveStore(state.store);
  }
  renderEntries();
}

function entryMetadata(entry) {
  return {
    title: entry.title || "",
    type: entry.type || "other",
    email: entry.email || "",
    syncGroupId: entry.syncGroupId || "",
  };
}

function remotePayloadForEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    login: entry.login,
    email: entry.email,
    password: entry.password,
    agency: entry.agency,
    account: entry.account,
    url: entry.url,
    phone: entry.phone,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function encryptEntryForApi(entry) {
  const key = entry.scope === "shared"
    ? await deriveRemoteKey(state.masterPassword, state.user.id, state.workspace.id)
    : await deriveRemoteKey(state.masterPassword, state.user.id);
  return encryptJson(key, remotePayloadForEntry(entry));
}

async function decryptRemoteItem(item) {
  const key = item.scope === "shared"
    ? await deriveRemoteKey(state.masterPassword, state.user.id, item.workspaceId)
    : await deriveRemoteKey(state.masterPassword, state.user.id);
  const decrypted = await decryptJson(key, item.encryptedData);
  return normalizeEntry({
    ...decrypted,
    id: decrypted.id || item.id,
    remoteId: item.id,
    scope: item.scope,
    syncEnabled: item.syncEnabled,
    syncRole: item.syncRole,
    syncGroupId: item.syncGroupId,
    linkedItemId: item.linkedItemId,
    createdAt: decrypted.createdAt || item.createdAt,
    updatedAt: decrypted.updatedAt || item.updatedAt,
  });
}

async function saveEntryToApi(entry) {
  if (!state.remoteMode) return entry;
  const encryptedData = await encryptEntryForApi(entry);
  const body = {
    scope: entry.scope,
    workspaceId: entry.scope === "shared" ? state.workspace.id : undefined,
    encryptedData,
    metadata: entryMetadata(entry),
    syncEnabled: entry.syncEnabled,
    syncRole: entry.syncRole,
    syncGroupId: entry.syncGroupId,
    linkedItemId: entry.linkedItemId,
  };
  const response = entry.remoteId
    ? await apiFetch(`/api/vault-items/${entry.remoteId}`, { method: "PUT", body })
    : await apiFetch("/api/vault-items", { method: "POST", body });
  return { ...entry, remoteId: response.item.id };
}

async function deleteEntryFromApi(entry) {
  if (!state.remoteMode || !entry?.remoteId) return;
  await apiFetch(`/api/vault-items/${entry.remoteId}`, { method: "DELETE" });
}

async function loadEntriesFromApi() {
  const response = await apiFetch("/api/vault-items?scope=all");
  const decrypted = [];
  const failed = [];
  for (const item of response.items) {
    try {
      decrypted.push(await decryptRemoteItem(item));
    } catch {
      failed.push(item.id);
    }
  }
  state.entries = decrypted;
  await persistEntries();
  if (failed.length) {
    setMessage(elements.saveMessage, `${failed.length} item(ns) nao puderam ser descriptografados com esta senha mestra.`, "error");
  }
}

async function syncAllEntriesToApi() {
  if (!state.remoteMode) return;
  for (let index = 0; index < state.entries.length; index += 1) {
    state.entries[index] = await saveEntryToApi(state.entries[index]);
  }
  await persistEntries();
}

function unlockView() {
  elements.masterPassword.value = "";
  elements.confirmPassword.value = "";
  elements.lockedView.classList.add("hidden");
  elements.vaultView.classList.remove("hidden");
  state.vaultScope = "private";
  elements.privateVaultButton.classList.add("active");
  elements.sharedVaultButton.classList.remove("active");
  setMobileScreen("list");
  elements.searchInput.focus();
  resetForm();
  renderEntries();
  resetLockTimer();
}

function lockVault() {
  clearTimeout(state.lockTimer);
  state.masterKey = null;
  state.store = null;
  state.entries = [];
  state.activeId = null;
  state.token = null;
  state.user = null;
  state.workspace = null;
  state.remoteMode = false;
  state.masterPassword = "";
  clearSession();
  elements.vaultView.classList.add("hidden");
  elements.lockedView.classList.remove("hidden");
  elements.masterPassword.value = "";
  elements.masterPassword.focus();
  setupAuthMode();
}

function setupAuthMode() {
  elements.apiBaseUrl.value = state.apiBaseUrl;
  setAuthMode(state.authMode);
  setMessage(elements.authMessage, "");
}

function formatType(type) {
  return { email: "Email", bank: "Banco", app: "Aplicativo", other: "Outro" }[type] || "Outro";
}

function renderEntries() {
  const query = state.query.trim().toLowerCase();
  const visible = state.entries
    .filter((entry) => (entry.scope || "private") === state.vaultScope)
    .filter((entry) => state.filter === "all" || entry.type === state.filter)
    .filter((entry) => {
      const haystack = [
        entry.title,
        entry.login,
        entry.email,
        entry.url,
        entry.agency,
        entry.account,
        entry.phone,
        entry.notes,
      ].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  const privateCount = state.entries.filter((entry) => (entry.scope || "private") === "private").length;
  const sharedCount = state.entries.filter((entry) => entry.scope === "shared").length;
  elements.entryCount.textContent = `${privateCount} privados - ${sharedCount} compartilhados`;
  elements.entryList.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "entry-meta";
    empty.textContent = "Nenhum item encontrado";
    elements.entryList.append(empty);
    return;
  }

  for (const entry of visible) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `entry-item ${entry.id === state.activeId ? "active" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(entry.title || "Sem nome")}</strong>
      <div class="entry-meta">${formatType(entry.type)}${entry.email ? ` - ${escapeHtml(entry.email)}` : ""}</div>
    `;
    item.addEventListener("click", () => selectEntry(entry.id));
    elements.entryList.append(item);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  state.activeId = id;
  elements.formTitle.textContent = "Editar acesso";
  elements.deleteButton.classList.remove("hidden");
  elements.entryType.value = entry.type || "other";
  elements.entryTitle.value = entry.title || "";
  elements.entryLogin.value = entry.login || "";
  elements.entryEmail.value = entry.email || "";
  elements.entryPassword.value = entry.password || "";
  elements.entryAgency.value = entry.agency || "";
  elements.entryAccount.value = entry.account || "";
  elements.entryUrl.value = entry.url || "";
  elements.entryPhone.value = entry.phone || "";
  elements.entryNotes.value = entry.notes || "";
  elements.lastUpdated.textContent = entry.updatedAt ? `Alterado em ${new Date(entry.updatedAt).toLocaleString("pt-BR")}` : "";
  updateSyncUi(entry);
  setMessage(elements.saveMessage, "");
  renderEntries();
  if (isMobileLayout()) setMobileScreen("form");
  resetLockTimer();
}

function updateSyncUi(entry) {
  const isPrivate = (entry.scope || "private") === "private";
  const isSharedMirror = entry.scope === "shared" && entry.syncRole === "mirror";
  elements.shareButton.classList.toggle("hidden", !isPrivate || entry.syncEnabled);
  elements.stopSyncButton.classList.toggle("hidden", !entry.syncEnabled);
  elements.syncPanel.classList.remove("hidden");

  if (isPrivate && entry.syncEnabled) {
    elements.syncTitle.textContent = "Sincronizado com compartilhado";
    elements.syncDescription.textContent = "Ao salvar este item privado, a copia compartilhada sera atualizada automaticamente.";
    return;
  }

  if (isSharedMirror) {
    elements.syncTitle.textContent = "Copia sincronizada";
    elements.syncDescription.textContent = "Este item vem de um cofre privado. Ele sera atualizado quando o dono salvar a versao privada.";
    return;
  }

  if (isPrivate) {
    elements.syncTitle.textContent = "Privado";
    elements.syncDescription.textContent = "Voce pode enviar uma copia para o cofre compartilhado e manter sincronizada.";
    return;
  }

  elements.syncTitle.textContent = "Compartilhado";
  elements.syncDescription.textContent = "Este item pertence apenas ao cofre compartilhado.";
}

function resetForm() {
  state.activeId = null;
  elements.entryForm.reset();
  elements.entryPassword.type = "password";
  elements.formTitle.textContent = "Novo acesso";
  elements.lastUpdated.textContent = "Sem alteracoes";
  elements.deleteButton.classList.add("hidden");
  elements.shareButton.classList.add("hidden");
  elements.stopSyncButton.classList.add("hidden");
  elements.syncPanel.classList.add("hidden");
  setMessage(elements.saveMessage, "");
  renderEntries();
}

function newEntry() {
  resetForm();
  setMobileScreen("form");
  setTimeout(() => elements.entryTitle.focus(), 50);
}

function readForm() {
  const now = new Date().toISOString();
  const existing = state.entries.find((entry) => entry.id === state.activeId);
  return {
    id: state.activeId || crypto.randomUUID(),
    scope: existing?.scope || state.vaultScope,
    type: elements.entryType.value,
    title: elements.entryTitle.value.trim(),
    login: elements.entryLogin.value.trim(),
    email: elements.entryEmail.value.trim(),
    password: elements.entryPassword.value,
    agency: elements.entryAgency.value.trim(),
    account: elements.entryAccount.value.trim(),
    url: elements.entryUrl.value.trim(),
    phone: elements.entryPhone.value.trim(),
    notes: elements.entryNotes.value.trim(),
    syncEnabled: Boolean(existing?.syncEnabled),
    syncRole: existing?.syncRole || null,
    syncGroupId: existing?.syncGroupId || null,
    linkedItemId: existing?.linkedItemId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*()-_=+?";
  const bytes = randomBytes(24);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function copyCredentialFields(source, target) {
  return {
    ...target,
    type: source.type,
    title: source.title,
    login: source.login,
    email: source.email,
    password: source.password,
    agency: source.agency,
    account: source.account,
    url: source.url,
    phone: source.phone,
    notes: source.notes,
    updatedAt: new Date().toISOString(),
  };
}

function syncSharedMirror(source) {
  if ((source.scope || "private") !== "private" || !source.syncEnabled) return source;

  let mirror = state.entries.find((entry) => entry.id === source.linkedItemId && entry.scope === "shared");
  const syncGroupId = source.syncGroupId || crypto.randomUUID();

  if (!mirror) {
    mirror = {
      id: crypto.randomUUID(),
      scope: "shared",
      syncEnabled: true,
      syncRole: "mirror",
      syncGroupId,
      linkedItemId: source.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.entries.push(mirror);
  }

  mirror = copyCredentialFields(source, {
    ...mirror,
    scope: "shared",
    syncEnabled: true,
    syncRole: "mirror",
    syncGroupId,
    linkedItemId: source.id,
  });

  const mirrorIndex = state.entries.findIndex((entry) => entry.id === mirror.id);
  state.entries[mirrorIndex] = mirror;

  return {
    ...source,
    syncEnabled: true,
    syncRole: "source",
    syncGroupId,
    linkedItemId: mirror.id,
  };
}

async function shareActiveEntry() {
  const entry = state.entries.find((item) => item.id === state.activeId);
  if (!entry || (entry.scope || "private") !== "private") return;
  const confirmed = confirm("Compartilhar esta credencial com o cofre compartilhado e manter sincronizada automaticamente?");
  if (!confirmed) return;

  const source = {
    ...entry,
    syncEnabled: true,
    syncRole: "source",
    syncGroupId: entry.syncGroupId || crypto.randomUUID(),
  };
  const syncedSource = syncSharedMirror(source);
  const sourceIndex = state.entries.findIndex((item) => item.id === entry.id);
  state.entries[sourceIndex] = syncedSource;
  if (state.remoteMode) {
    await syncAllEntriesToApi();
  } else {
    await persistEntries();
  }
  selectEntry(syncedSource.id);
  setMessage(elements.saveMessage, "Copia compartilhada criada e sincronizada.", "success");
}

async function stopActiveSync() {
  const entry = state.entries.find((item) => item.id === state.activeId);
  if (!entry || !entry.syncEnabled) return;
  const confirmed = confirm("Parar a sincronizacao? A copia compartilhada sera mantida, mas nao recebera novas atualizacoes.");
  if (!confirmed) return;

  const linked = state.entries.find((item) => item.id === entry.linkedItemId);
  if (linked) {
    linked.syncEnabled = false;
    linked.syncRole = null;
    linked.syncGroupId = null;
    linked.linkedItemId = null;
    linked.updatedAt = new Date().toISOString();
  }

  entry.syncEnabled = false;
  entry.syncRole = null;
  entry.syncGroupId = null;
  entry.linkedItemId = null;
  entry.updatedAt = new Date().toISOString();
  if (state.remoteMode) {
    await syncAllEntriesToApi();
  } else {
    await persistEntries();
  }
  selectEntry(entry.id);
  setMessage(elements.saveMessage, "Sincronizacao interrompida.", "success");
}

async function exportVault() {
  const payload = state.store || {
    version: 2,
    mode: "remote-export",
    user: state.user,
    workspace: state.workspace,
    entries: state.entries,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cofre-acessos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importVault(file) {
  const text = await file.text();
  const imported = JSON.parse(text);
  if (!imported.salt || !imported.verifier || !imported.vault) {
    throw new Error("Arquivo invalido.");
  }
  saveStore(imported);
  lockVault();
  setMessage(elements.authMessage, "Arquivo importado. Desbloqueie com a senha mestra dele.", "success");
}

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = elements.masterPassword.value;

  try {
    setMessage(elements.authMessage, "Processando...");
    if (state.authMode === "register") {
      if (password.length < 10) throw new Error("Use pelo menos 10 caracteres.");
      if (password !== elements.confirmPassword.value) throw new Error("As senhas nao conferem.");
    }
    await authenticateOnline(password);
  } catch (error) {
    setMessage(elements.authMessage, error.message || "Nao foi possivel entrar.", "error");
  }
});

elements.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetLockTimer();
  const entry = readForm();
  if (!entry.title) {
    setMessage(elements.saveMessage, "Informe um nome.", "error");
    return;
  }

  const entryToSave = syncSharedMirror(entry);
  const index = state.entries.findIndex((item) => item.id === entryToSave.id);
  if (index >= 0) {
    state.entries[index] = entryToSave;
  } else {
    state.entries.push(entryToSave);
  }
  state.activeId = entryToSave.id;
  if (state.remoteMode) {
    await syncAllEntriesToApi();
  } else {
    await persistEntries();
  }
  selectEntry(entryToSave.id);
  setMessage(elements.saveMessage, "Salvo.", "success");
});

elements.newButton.addEventListener("click", newEntry);
elements.mobileNewButton.addEventListener("click", newEntry);
elements.shareButton.addEventListener("click", shareActiveEntry);
elements.stopSyncButton.addEventListener("click", stopActiveSync);
elements.loginModeButton.addEventListener("click", () => setAuthMode("login"));
elements.registerModeButton.addEventListener("click", () => setAuthMode("register"));

elements.deleteButton.addEventListener("click", async () => {
  if (!state.activeId) return;
  const entry = state.entries.find((item) => item.id === state.activeId);
  if (!confirm(`Excluir "${entry?.title || "este item"}"?`)) return;
  if (entry?.syncEnabled && entry.syncRole === "source") {
    const linked = state.entries.find((item) => item.id === entry.linkedItemId);
    await deleteEntryFromApi(entry);
    await deleteEntryFromApi(linked);
    state.entries = state.entries.filter((item) => item.id !== state.activeId && item.id !== entry.linkedItemId);
  } else {
    const linked = state.entries.find((item) => item.id === entry?.linkedItemId);
    if (linked) {
      linked.syncEnabled = false;
      linked.syncRole = null;
      linked.syncGroupId = null;
      linked.linkedItemId = null;
      linked.updatedAt = new Date().toISOString();
    }
    await deleteEntryFromApi(entry);
    state.entries = state.entries.filter((item) => item.id !== state.activeId);
  }
  if (state.remoteMode) {
    await syncAllEntriesToApi();
  } else {
    await persistEntries();
  }
  resetForm();
  setMobileScreen("list");
});

elements.privateVaultButton.addEventListener("click", () => setVaultScope("private"));
elements.sharedVaultButton.addEventListener("click", () => setVaultScope("shared"));
elements.showListButton.addEventListener("click", () => setMobileScreen("list"));
elements.showFormButton.addEventListener("click", () => setMobileScreen("form"));

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  renderEntries();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    state.filter = tab.dataset.filter;
    renderEntries();
  });
});

elements.toggleMaster.addEventListener("click", () => {
  elements.masterPassword.type = elements.masterPassword.type === "password" ? "text" : "password";
});

elements.toggleEntryPassword.addEventListener("click", () => {
  elements.entryPassword.type = elements.entryPassword.type === "password" ? "text" : "password";
});

elements.copyPassword.addEventListener("click", async () => {
  if (!elements.entryPassword.value) return;
  await navigator.clipboard.writeText(elements.entryPassword.value);
  setMessage(elements.saveMessage, "Senha copiada.", "success");
  resetLockTimer();
});

elements.generatePassword.addEventListener("click", () => {
  elements.entryPassword.value = generatePassword();
  setMessage(elements.saveMessage, "Senha gerada.", "success");
});

elements.exportButton.addEventListener("click", exportVault);
elements.syncButton.addEventListener("click", async () => {
  try {
    setMessage(elements.saveMessage, "Sincronizando...");
    await syncAllEntriesToApi();
    await loadEntriesFromApi();
    setMessage(elements.saveMessage, "Sincronizado.", "success");
  } catch (error) {
    setMessage(elements.saveMessage, error.message || "Erro ao sincronizar.", "error");
  }
});
elements.lockButton.addEventListener("click", lockVault);

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
});

elements.importFile.addEventListener("change", async () => {
  const [file] = elements.importFile.files;
  if (!file) return;
  try {
    await importVault(file);
  } catch (error) {
    setMessage(elements.saveMessage, "Nao foi possivel importar o arquivo.", "error");
  } finally {
    elements.importFile.value = "";
  }
});

["keydown", "click", "input"].forEach((eventName) => {
  window.addEventListener(eventName, () => {
    if (state.masterKey) resetLockTimer();
  });
});

setupAuthMode();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.classList.remove("hidden");
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
