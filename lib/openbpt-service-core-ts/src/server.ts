import Fastify from "fastify";
import { routes } from "./routes";
import { connectToServiceManager } from "./connector";
import logger from "./logger";
import { config } from "./config";
import {
  ServiceInputPayload,
  ServiceManifest,
  ToolExchangePayload,
} from "./interfaces";

export function init<M extends ServiceManifest>(
  manifest: M,
  runFunction: (input: ServiceInputPayload) => Promise<ToolExchangePayload>,
) {
  const fastify = Fastify({});

  fastify.register(routes, { manifest, runFunction });

  // Start the server
  fastify.listen({ port: config.port, host: config.host }, (error) => {
    if (error) {
      logger.error(error);
      process.exit(1);
    }
    connectToServiceManager(manifest);
  });
}
