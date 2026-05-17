import { resolve } from "node:path";

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "0.0.0.0",
  dataFile: resolve(process.cwd(), process.env.DATA_FILE || "./data/db.json"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
