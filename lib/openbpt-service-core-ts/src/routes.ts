import { FastifyInstance } from "fastify";
import logger from "./logger";
import {
  ServiceInputPayload,
  ServiceManifest,
  ToolExchangePayload,
} from "./interfaces";

interface HealthCheckResponse {
  id: string;
  success: boolean;
}

export async function routes<M extends ServiceManifest>(
  fastify: FastifyInstance,
  options: {
    manifest: M;
    runFunction: (input: ServiceInputPayload) => Promise<ToolExchangePayload>;
  },
) {
  const { manifest, runFunction } = options;
  fastify.get<{ Reply: HealthCheckResponse }>(
    "/healthcheck",
    async function handler(request, reply) {
      logger.info("Received '/healthcheck' request");
      reply.code(200).send({
        success: true,
        id: manifest.id,
      });
    },
  );

  fastify.post<{ Reply: ToolExchangePayload }>(
    "/run",
    async function handler(request, reply) {
      logger.info("Received '/run' request");
      try {
        const input = request.body as ServiceInputPayload;

        const result = await runFunction(input);

        reply.code(200).send(result);
      } catch (error: unknown) {
        logger.error(error);
        reply.code(500).send({
          error: (error as Error)?.message || "Internal service error",
        });
      }
    },
  );
}
