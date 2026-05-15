import { z } from "zod";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateRouteInput,
  CreatePresetInput,
  BulkDeleteRoutesInput,
  MockdockEvent,
  MoveRouteInput,
  NormalizedQuery,
  RenameWorkspaceInput,
  SetActivePresetInput,
  UpdatePresetInput
} from "@mockdock/shared";

import type { SseBroker } from "../events/sse-broker.js";
import type { PresetRepository } from "../repositories/preset-repository.js";
import type { RequestLogRepository } from "../repositories/request-log-repository.js";
import type { RouteRepository } from "../repositories/route-repository.js";
import type { WorkspaceRepository } from "../repositories/workspace-repository.js";

const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1)
});

const renameWorkspaceSchema = z.object({
  slug: z.string().min(1)
});

const moveRouteSchema = z.object({
  destinationWorkspaceId: z.string().min(1)
});

const bulkDeleteRoutesSchema = z.object({
  routeIds: z.array(z.string().min(1)).min(1)
});

const createRouteSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  pattern: z.string().min(1),
  examplePath: z.string().min(1).optional()
});

const presetSchema = z.object({
  name: z.string().min(1),
  statusCode: z.number().int().min(100).max(599),
  headers: z.record(z.string()),
  body: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("json"),
      value: z.unknown()
    }),
    z.object({
      kind: z.literal("text"),
      value: z.string()
    }),
    z.object({
      kind: z.literal("xml"),
      value: z.string()
    }),
    z.object({
      kind: z.literal("raw"),
      value: z.string()
    }),
    z.object({
      kind: z.literal("urlEncoded"),
      entries: z.array(z.object({ key: z.string(), value: z.string() }))
    }),
    z.object({
      kind: z.literal("formData"),
      entries: z.array(z.object({ key: z.string(), value: z.string() }))
    }),
    z.object({
      kind: z.literal("binary"),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      base64: z.string(),
      sizeBytes: z.number().int().min(0)
    })
  ]),
  delayMs: z.number().int().min(0)
});

const activePresetSchema = z.object({
  presetId: z.string().nullable()
});

const variantSchema = z.object({
  querySignature: z.record(z.union([z.string(), z.array(z.string())])).nullable(),
  queryDisplay: z.string().min(1).optional()
});

const patternUpdateSchema = z.object({
  pattern: z.string().min(1),
  examplePath: z.string().min(1).optional()
});

const patternSegmentSchema = z.object({
  index: z.number().int().min(0),
  value: z.string().min(1)
});

function writeSseEvent(reply: FastifyReply, event: MockdockEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
}

function parseJsonBody(request: FastifyRequest): unknown {
  const body = request.body;
  return body === undefined ? {} : body;
}

async function getRouteOr404(
  routeRepository: RouteRepository,
  routeId: string,
  reply: FastifyReply
) {
  const route = await routeRepository.getById(routeId);
  if (!route) {
    reply.code(404);
    return null;
  }

  return route;
}

async function getVariantOr404(
  routeRepository: RouteRepository,
  variantId: string,
  reply: FastifyReply
) {
  const variant = await routeRepository.getVariantById(variantId);
  if (!variant) {
    reply.code(404);
    return null;
  }

  return variant;
}

async function getDefaultVariantOr404(
  routeRepository: RouteRepository,
  routeId: string,
  reply: FastifyReply
) {
  const variant = await routeRepository.getDefaultVariant(routeId);
  if (!variant) {
    reply.code(404);
    return null;
  }

  return variant;
}

export async function registerInternalRoutes(
  app: FastifyInstance,
  dependencies: {
    workspaceRepository: WorkspaceRepository;
    routeRepository: RouteRepository;
    requestLogRepository: RequestLogRepository;
    presetRepository: PresetRepository;
    broker: SseBroker;
    appVersion: string;
  }
): Promise<void> {
  const {
    workspaceRepository,
    routeRepository,
    requestLogRepository,
    presetRepository,
    broker,
    appVersion
  } = dependencies;

  app.get("/__mockdock/health", async () => ({
    ok: true,
    database: "ok",
    version: appVersion
  }));

  app.get("/__mockdock/version", async () => ({ version: appVersion }));

  app.get("/__mockdock/workspaces", async () => workspaceRepository.list());

  app.post("/__mockdock/workspaces", async (request, reply) => {
    const input = createWorkspaceSchema.parse(parseJsonBody(request));
    const workspace = await workspaceRepository.create(input);
    reply.code(201);
    return workspace;
  });

  app.patch("/__mockdock/workspaces/:workspaceId", async (request, reply) => {
    const workspace = await workspaceRepository.rename(
      (request.params as { workspaceId: string }).workspaceId,
      (renameWorkspaceSchema.parse(parseJsonBody(request)) as RenameWorkspaceInput).slug
    );

    if (!workspace) {
      reply.code(404);
      return { message: "Workspace not found" };
    }

    return workspace;
  });

  app.delete("/__mockdock/workspaces/:workspaceId", async (request, reply) => {
    await workspaceRepository.delete((request.params as { workspaceId: string }).workspaceId);
    reply.code(204);
    return null;
  });

  app.get("/__mockdock/workspaces/:workspaceId/routes", async (request, reply) => {
    const workspace = await workspaceRepository.findById(
      (request.params as { workspaceId: string }).workspaceId
    );

    if (!workspace) {
      reply.code(404);
      return { message: "Workspace not found" };
    }

    return routeRepository.getWorkspaceRoutes(workspace.id);
  });

  app.post("/__mockdock/workspaces/:workspaceId/routes", async (request, reply) => {
    const workspace = await workspaceRepository.findById(
      (request.params as { workspaceId: string }).workspaceId
    );

    if (!workspace) {
      reply.code(404);
      return { message: "Workspace not found" };
    }

    const input = createRouteSchema.parse(parseJsonBody(request)) as CreateRouteInput;
    const result = await routeRepository.createManual({
      workspaceId: workspace.id,
      method: input.method,
      pattern: input.pattern,
      examplePath: input.examplePath
    });

    reply.code(result.created ? 201 : 200);
    return result.route;
  });

  app.get("/__mockdock/routes/:routeId/requests", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    return requestLogRepository.listByRouteMatch(route);
  });

  app.post("/__mockdock/routes/:routeId/move", async (request) => {
    const input = moveRouteSchema.parse(parseJsonBody(request)) as MoveRouteInput;
    return routeRepository.move(
      (request.params as { routeId: string }).routeId,
      input.destinationWorkspaceId
    );
  });

  app.post("/__mockdock/routes/bulk-delete", async (request) => {
    const input = bulkDeleteRoutesSchema.parse(parseJsonBody(request)) as BulkDeleteRoutesInput;
    return routeRepository.bulkDelete(input.routeIds);
  });

  app.put("/__mockdock/routes/:routeId/pattern", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const input = patternUpdateSchema.parse(parseJsonBody(request));
    return routeRepository.updatePattern({
      routeId: route.id,
      pattern: input.pattern,
      examplePath: input.examplePath
    });
  });

  app.post("/__mockdock/routes/:routeId/convert-segment", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const input = patternSegmentSchema.parse(parseJsonBody(request));
    return routeRepository.replacePatternSegment({
      routeId: route.id,
      index: input.index,
      value: input.value
    });
  });

  app.delete("/__mockdock/routes/:routeId", async (request, reply) => {
    await routeRepository.delete((request.params as { routeId: string }).routeId);
    reply.code(204);
    return null;
  });

  app.get("/__mockdock/routes/:routeId/variants", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    return routeRepository.getVariants(route.id);
  });

  app.post("/__mockdock/routes/:routeId/variants", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const input = variantSchema.parse(parseJsonBody(request));
    const variant = await routeRepository.createVariant({
      routePatternId: route.id,
      querySignature: input.querySignature as NormalizedQuery | null,
      queryDisplay: input.queryDisplay
    });

    reply.code(201);
    return variant;
  });

  app.put("/__mockdock/variants/:variantId", async (request, reply) => {
    const variant = await getVariantOr404(
      routeRepository,
      (request.params as { variantId: string }).variantId,
      reply
    );
    if (!variant) {
      return { message: "Route variant not found" };
    }

    const input = variantSchema.parse(parseJsonBody(request));
    return routeRepository.updateVariant({
      variantId: variant.id,
      querySignature: input.querySignature as NormalizedQuery | null,
      queryDisplay: input.queryDisplay
    });
  });

  app.delete("/__mockdock/variants/:variantId", async (request, reply) => {
    await routeRepository.deleteVariant((request.params as { variantId: string }).variantId);
    reply.code(204);
    return null;
  });

  app.get("/__mockdock/routes/:routeId/presets", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const defaultVariant = await getDefaultVariantOr404(routeRepository, route.id, reply);
    if (!defaultVariant) {
      return { message: "Default variant not found" };
    }

    return presetRepository.listByVariant(defaultVariant.id);
  });

  app.post("/__mockdock/routes/:routeId/presets", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const defaultVariant = await getDefaultVariantOr404(routeRepository, route.id, reply);
    if (!defaultVariant) {
      return { message: "Default variant not found" };
    }

    const input = presetSchema.parse(parseJsonBody(request)) as CreatePresetInput;
    const preset = await presetRepository.create(defaultVariant.id, input);
    broker.publish({
      type: "response_preset_updated",
      payload: {
        routePatternId: route.id,
        routeResponseVariantId: defaultVariant.id,
        presetId: preset.id,
        action: "created"
      }
    });
    reply.code(201);
    return preset;
  });

  app.get("/__mockdock/variants/:variantId/presets", async (request, reply) => {
    const variant = await getVariantOr404(
      routeRepository,
      (request.params as { variantId: string }).variantId,
      reply
    );
    if (!variant) {
      return { message: "Route variant not found" };
    }

    return presetRepository.listByVariant(variant.id);
  });

  app.post("/__mockdock/variants/:variantId/presets", async (request, reply) => {
    const variant = await getVariantOr404(
      routeRepository,
      (request.params as { variantId: string }).variantId,
      reply
    );
    if (!variant) {
      return { message: "Route variant not found" };
    }

    const input = presetSchema.parse(parseJsonBody(request)) as CreatePresetInput;
    const preset = await presetRepository.create(variant.id, input);
    broker.publish({
      type: "response_preset_updated",
      payload: {
        routePatternId: variant.routePatternId,
        routeResponseVariantId: variant.id,
        presetId: preset.id,
        action: "created"
      }
    });
    reply.code(201);
    return preset;
  });

  app.put("/__mockdock/presets/:presetId", async (request, reply) => {
    const preset = await presetRepository.update(
      (request.params as { presetId: string }).presetId,
      presetSchema.parse(parseJsonBody(request)) as UpdatePresetInput
    );

    if (!preset) {
      reply.code(404);
      return { message: "Preset not found" };
    }

    const variant = await routeRepository.getVariantById(preset.routeResponseVariantId);
    if (!variant) {
      reply.code(404);
      return { message: "Route variant not found" };
    }

    broker.publish({
      type: "response_preset_updated",
      payload: {
        routePatternId: variant.routePatternId,
        routeResponseVariantId: variant.id,
        presetId: preset.id,
        action: "updated"
      }
    });

    return preset;
  });

  app.delete("/__mockdock/presets/:presetId", async (request, reply) => {
    const preset = await presetRepository.getById((request.params as { presetId: string }).presetId);
    if (!preset) {
      reply.code(404);
      return { message: "Preset not found" };
    }

    if (preset.isSystem) {
      reply.code(409);
      return { message: "Default preset cannot be deleted" };
    }

    const variant = await routeRepository.getVariantById(preset.routeResponseVariantId);
    if (!variant) {
      reply.code(404);
      return { message: "Route variant not found" };
    }

    const variantPresets = await presetRepository.listByVariant(variant.id);
    if (variantPresets.length <= 1) {
      reply.code(409);
      return { message: "At least one preset is required" };
    }
    const fallbackPresetId = variantPresets.find((item) => item.id !== preset.id)?.id ?? null;

    await presetRepository.delete(preset.id);

    if (variant.activeResponsePresetId === preset.id) {
      await routeRepository.setActivePresetForVariant(variant.id, fallbackPresetId);
      broker.publish({
        type: "active_preset_changed",
        payload: {
          routePatternId: variant.routePatternId,
          routeResponseVariantId: variant.id,
          presetId: fallbackPresetId
        }
      });
    }

    broker.publish({
      type: "response_preset_updated",
      payload: {
        routePatternId: variant.routePatternId,
        routeResponseVariantId: variant.id,
        presetId: preset.id,
        action: "deleted"
      }
    });

    reply.code(204);
    return null;
  });

  app.post("/__mockdock/routes/:routeId/active-preset", async (request, reply) => {
    const route = await getRouteOr404(
      routeRepository,
      (request.params as { routeId: string }).routeId,
      reply
    );
    if (!route) {
      return { message: "Route not found" };
    }

    const variant = await getDefaultVariantOr404(routeRepository, route.id, reply);
    if (!variant) {
      return { message: "Default variant not found" };
    }

    const input = activePresetSchema.parse(parseJsonBody(request)) as SetActivePresetInput;
    if (input.presetId) {
      const preset = await presetRepository.getById(input.presetId);
      if (!preset || preset.routeResponseVariantId !== variant.id) {
        reply.code(404);
        return { message: "Preset not found" };
      }
    }

    await routeRepository.setActivePresetForVariant(variant.id, input.presetId);
    broker.publish({
      type: "active_preset_changed",
      payload: {
        routePatternId: route.id,
        routeResponseVariantId: variant.id,
        presetId: input.presetId
      }
    });

    return { ok: true };
  });

  app.post("/__mockdock/variants/:variantId/active-preset", async (request, reply) => {
    const variant = await getVariantOr404(
      routeRepository,
      (request.params as { variantId: string }).variantId,
      reply
    );
    if (!variant) {
      return { message: "Route variant not found" };
    }

    const input = activePresetSchema.parse(parseJsonBody(request)) as SetActivePresetInput;
    if (input.presetId) {
      const preset = await presetRepository.getById(input.presetId);
      if (!preset || preset.routeResponseVariantId !== variant.id) {
        reply.code(404);
        return { message: "Preset not found" };
      }
    }

    await routeRepository.setActivePresetForVariant(variant.id, input.presetId);
    broker.publish({
      type: "active_preset_changed",
      payload: {
        routePatternId: variant.routePatternId,
        routeResponseVariantId: variant.id,
        presetId: input.presetId
      }
    });

    return { ok: true };
  });

  app.get("/__mockdock/events", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const unsubscribe = broker.subscribe((event) => {
      writeSseEvent(reply, event);
    });

    reply.raw.write(": connected\n\n");
    reply.raw.on("close", () => {
      unsubscribe();
      reply.raw.end();
    });

    return reply;
  });
}
