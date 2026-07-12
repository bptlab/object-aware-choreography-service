import { ServiceInputPayload, ServiceManifest, ToolExchangePayload } from "./interfaces";
export declare function init<M extends ServiceManifest>(manifest: M, runFunction: (input: ServiceInputPayload) => Promise<ToolExchangePayload>): void;
