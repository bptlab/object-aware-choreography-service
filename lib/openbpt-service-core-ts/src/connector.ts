import axios, { AxiosError } from "axios";
import logger from "./logger";
import { config, defaultAxiosTimeout } from "./config";
import { ServiceManifest } from "./interfaces";

const request = axios.create({
  timeout: defaultAxiosTimeout,
  headers: {
    "Content-Type": "application/json",
    [config.backendApiKeyHeader]: config.backendApiKey,
  },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(
  fn: () => Promise<unknown>,
  retriesLeft: number,
  interval: number,
  functionName?: string,
): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    // If no retries left, rethrow the error
    if (retriesLeft === 0) {
      throw error;
    }
    logger.warn(
      `Function (${
        functionName ? functionName : fn.name
      }) failed. Retry in ${interval} ms. Retries left: ${retriesLeft - 1}`,
    );
    await sleep(interval);
    if (retriesLeft === -1) {
      return retry(fn, retriesLeft, interval, functionName);
    }
    return retry(fn, retriesLeft - 1, interval, functionName);
  }
}

export async function connectToServiceManager(manifest: ServiceManifest) {
  const repeatForever = true;
  while (repeatForever) {
    try {
      await retry(
        () => registerAtServiceManager(manifest),
        config.registrationTries,
        config.registrationRetryDelay,
        "registerAtServiceManager",
      );
      logger.info(
        `Successfully registered at service manager (${config.serviceManagerUrl})`,
      );
      try {
        await monitorConnection(manifest.id);
      } catch (error) {
        logger.error(
          "Failed to maintain connection to service manager. Trying to re-register.",
        );
        logger.error(error);
      }
    } catch (error) {
      logger.error("Failed to register at service manager.");
      logger.error(error);
      process.exit(1);
    }
  }
}

async function monitorConnection(
  serviceId: string,
): Promise<boolean | undefined> {
  const repeatForever = true;
  while (repeatForever) {
    const success = await retry(
      () => heartbeat(serviceId),
      config.heartbeatTries,
      config.heartbeatRetryDelay,
      "heartbeat",
    );
    if (success === false) {
      logger.warn("Service manager rejected heartbeat. Trying to re-register.");
      return false;
    }
    await sleep(config.heartbeatInterval);
  }
  return undefined;
}

async function heartbeat(serviceId: string): Promise<boolean> {
  const url = `${config.serviceManagerUrl}/${serviceId}${config.heartbeatEndpoint}`;
  try {
    await request.post(url);
    return true;
  } catch (error) {
    const response = (error as AxiosError).response;
    if (response && response.status === 400) {
      return false;
    }
    throw error;
  }
}

async function registerAtServiceManager(manifest: ServiceManifest) {
  const url = `${config.serviceManagerUrl}${config.registrationEndpoint}`;
  return request.post(url, {
    manifest,
  });
}
