const STORAGE_KEY = "cofre-acessos-v1";
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
  lockTimer: null,
};

const $ = (id) => document.getElementById(id);

const elements = {
  lockedView: $("lockedView"),
  vaultView: $("vaultView"),
  vaultStatus: $("vaultStatus"),
  authForm: $("authForm"),
  masterPassword: $("masterPassword"),
  confirmPassword: $("confirmPassword"),
  confirmLabel: $("confirmLabel"),
  authButton: $("authButton"),
  authMessage: $("authMessage"),
  toggleMaster: $("toggleMaster"),
  entryCount: $("entryCount"),
  exportButton: $("exportButton"),
  importFile: $("importFile"),
  installButton: $("installButton"),
  lockButton: $("lockButton"),
  showListButton: $("showListButton"),
  showFormButton: $("showFormButton"),
  searchInput: $("searchInput"),
  entryList: $("entryList"),
  entryForm: $("entryForm"),
  formTitle: $("formTitle"),
  lastUpdated: $("lastUpdated"),
  newButton: $("newButton"),
  mobileNewButton: $("mobileNewButton"),
  deleteButton: $("deleteButton"),
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
  state.entries = Array.isArray(vault.entries) ? vault.entries : [];
  unlockView();
}

async function persistEntries() {
  const now = new Date().toISOString();
  state.store.vault = await encryptJson(state.masterKey, { entries: state.entries, updatedAt: now });
  saveStore(state.store);
  renderEntries();
}

function unlockView() {
  elements.masterPassword.value = "";
  elements.confirmPassword.value = "";
  elements.lockedView.classList.add("hidden");
  elements.vaultView.classList.remove("hidden");
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
  elements.vaultView.classList.add("hidden");
  elements.lockedView.classList.remove("hidden");
  elements.masterPassword.value = "";
  elements.masterPassword.focus();
  setupAuthMode();
}

function setupAuthMode() {
  const exists = hasVault();
  elements.vaultStatus.textContent = exists ? "Cofre local criptografado" : "Criar cofre local criptografado";
  elements.authButton.textContent = exists ? "Desbloquear" : "Criar cofre";
  elements.confirmPassword.classList.toggle("hidden", exists);
  elements.confirmLabel.classList.toggle("hidden", exists);
  elements.confirmPassword.required = !exists;
  setMessage(elements.authMessage, "");
}

function formatType(type) {
  return { email: "Email", bank: "Banco", app: "Aplicativo", other: "Outro" }[type] || "Outro";
}

function renderEntries() {
  const query = state.query.trim().toLowerCase();
  const visible = state.entries
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

  elements.entryCount.textContent = `${state.entries.length} ${state.entries.length === 1 ? "item" : "itens"}`;
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
  setMessage(elements.saveMessage, "");
  renderEntries();
  if (isMobileLayout()) setMobileScreen("form");
  resetLockTimer();
}

function resetForm() {
  state.activeId = null;
  elements.entryForm.reset();
  elements.entryPassword.type = "password";
  elements.formTitle.textContent = "Novo acesso";
  elements.lastUpdated.textContent = "Sem alteracoes";
  elements.deleteButton.classList.add("hidden");
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
  return {
    id: state.activeId || crypto.randomUUID(),
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
    createdAt: state.entries.find((entry) => entry.id === state.activeId)?.createdAt || now,
    updatedAt: now,
  };
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*()-_=+?";
  const bytes = randomBytes(24);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

async function exportVault() {
  const blob = new Blob([JSON.stringify(state.store, null, 2)], { type: "application/json" });
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
  const exists = hasVault();

  try {
    setMessage(elements.authMessage, "Processando...");
    if (!exists) {
      if (password.length < 10) throw new Error("Use pelo menos 10 caracteres.");
      if (password !== elements.confirmPassword.value) throw new Error("As senhas nao conferem.");
      await createVault(password);
      return;
    }
    await unlockVault(password);
  } catch (error) {
    setMessage(elements.authMessage, "Senha mestra incorreta ou cofre invalido.", "error");
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

  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.entries[index] = entry;
  } else {
    state.entries.push(entry);
  }
  state.activeId = entry.id;
  await persistEntries();
  selectEntry(entry.id);
  setMessage(elements.saveMessage, "Salvo.", "success");
});

elements.newButton.addEventListener("click", newEntry);
elements.mobileNewButton.addEventListener("click", newEntry);

elements.deleteButton.addEventListener("click", async () => {
  if (!state.activeId) return;
  const entry = state.entries.find((item) => item.id === state.activeId);
  if (!confirm(`Excluir "${entry?.title || "este item"}"?`)) return;
  state.entries = state.entries.filter((item) => item.id !== state.activeId);
  await persistEntries();
  resetForm();
  setMobileScreen("list");
});

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
