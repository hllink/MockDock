import Fastify from "fastify";

import { normalizeQuery, type HttpMethod } from "@mockdock/shared";

import type { AppConfig } from "./config.js";
import { bootstrapDatabase } from "./db/bootstrap.js";
import { createDatabaseClient } from "./db/client.js";
import { createSseBroker } from "./events/sse-broker.js";
import { PresetRepository } from "./repositories/preset-repository.js";
import { RequestLogRepository } from "./repositories/request-log-repository.js";
import { RouteRepository } from "./repositories/route-repository.js";
import { WorkspaceRepository } from "./repositories/workspace-repository.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { MockRequestService } from "./services/mock-request-service.js";

const ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD"
] as const satisfies HttpMethod[];

function parseBody(rawBody: string, contentTypeHeader?: string): unknown {
  if (!rawBody) {
    return null;
  }

  if (contentTypeHeader?.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

function normalizeHeaders(input: Record<string, string | string[] | undefined>) {
  return input;
}

export async function buildApp(config: AppConfig) {
  const client = createDatabaseClient(config.databasePath);
  await bootstrapDatabase(client);

  const broker = createSseBroker();
  const workspaceRepository = new WorkspaceRepository(client);
  const routeRepository = new RouteRepository(client);
  const requestLogRepository = new RequestLogRepository(client);
  const presetRepository = new PresetRepository(client);
  const mockRequestService = new MockRequestService(
    workspaceRepository,
    routeRepository,
    requestLogRepository,
    presetRepository,
    broker
  );

  const app = Fastify({
    logger: false,
    bodyLimit: config.bodyLimitBytes
  });

  app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as Error & { statusCode?: number };
    const statusCode =
      fastifyError.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
    reply.code(statusCode).send({
      message: fastifyError.message
    });
  });

  await registerInternalRoutes(app, {
    workspaceRepository,
    routeRepository,
    requestLogRepository,
    presetRepository,
    broker,
    appVersion: config.version
  });

  app.route({
    method: ALLOWED_METHODS,
    url: "/*",
    handler: async (request, reply) => {
      const result = await mockRequestService.handle({
        method: request.method as HttpMethod,
        rawPath: request.url.split("?")[0] ?? "/",
        query: normalizeQuery(request.query as Record<string, unknown>),
        headers: normalizeHeaders(request.headers),
        body: parseBody((request.body as string | undefined) ?? "", request.headers["content-type"]),
        ip: request.ip
      });

      Object.entries(result.headers).forEach(([header, value]) => {
        reply.header(header, value);
      });

      reply.code(result.statusCode);
      return result.body;
    }
  });

  app.addHook("onClose", async () => {
    await client.close();
  });

  return app;
}
