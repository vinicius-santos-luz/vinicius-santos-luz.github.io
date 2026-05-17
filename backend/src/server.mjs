import { createServer } from "node:http";
import { config } from "./config.mjs";
import { HttpError, routeKey, sendJson } from "./http.mjs";
import { handleRoutes } from "./routes.mjs";

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    const route = routeKey(req.url, req.method);
    const handled = await handleRoutes(req, res, route);
    if (!handled) {
      sendJson(res, 404, { error: "Rota nao encontrada." });
    }
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message, details: error.details });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: "Erro interno do servidor." });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Cofre backend rodando em http://${config.host}:${config.port}`);
});
