import { init } from "openbpt-service-core";
import type { ServiceInputPayload, ToolExchangePayload } from "openbpt-service-core";
import run from "./service.js";
import manifest from "./manifest.js";

init(
  manifest,
  run as (input: ServiceInputPayload) => Promise<ToolExchangePayload>,
);
