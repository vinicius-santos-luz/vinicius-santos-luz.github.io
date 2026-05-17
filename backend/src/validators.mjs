import { HttpError } from "./http.mjs";

export function requiredString(value, field, min = 1) {
  if (typeof value !== "string" || value.trim().length < min) {
    throw new HttpError(400, `Campo obrigatorio: ${field}.`);
  }
  return value.trim();
}

export function optionalString(value) {
  if (value == null) return "";
  if (typeof value !== "string") throw new HttpError(400, "Campo deve ser texto.");
  return value;
}

export function requiredObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `Campo obrigatorio: ${field}.`);
  }
  return value;
}

export function enumValue(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${field} invalido.`);
  }
  return value;
}
