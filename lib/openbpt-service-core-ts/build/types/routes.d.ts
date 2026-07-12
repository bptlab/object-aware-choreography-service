import { FastifyInstance } from "fastify";
import { ServiceInputPayload, ServiceManifest, ToolExchangePayload } from "./interfaces";
export declare function routes<M extends ServiceManifest>(fastify: FastifyInstance, options: {
    manifest: M;
    runFunction: (input: ServiceInputPayload) => Promise<ToolExchangePayload>;
}): Promise<void>;
