import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const scrypt = promisify(scryptCallback);

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64url(input) {
  const value = input.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(value, "base64");
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, hash] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signToken(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = createHmac("sha256", config.jwtSecret).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

export function verifyToken(token) {
  const [encodedHeader, encodedBody, encodedSignature] = String(token).split(".");
  if (!encodedHeader || !encodedBody || !encodedSignature) return null;

  const unsigned = `${encodedHeader}.${encodedBody}`;
  const expected = createHmac("sha256", config.jwtSecret).update(unsigned).digest();
  const actual = fromBase64url(encodedSignature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const payload = JSON.parse(fromBase64url(encodedBody).toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
