import logger from "./logger";
import dotenv from "dotenv";

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

export const defaultDelay = "5000"; // 5 seconds
export const defaultHeartbeatTimeout = "60000"; // 60 seconds
export const defaultHeartbeatInterval = "30000"; // 30 seconds
export const defaultAxiosTimeout = 1000; // 1 second
export const defaultTries = "5";

const {
  SERVICE_URL,
  HOST = "localhost",
  LOCAL_PORT,
  SERVICE_MANAGER_URL,
  BACKEND_API_KEY,
  BACKEND_API_KEY_HEADER,
  REGISTRATION_ENDPOINT = "/register",
  REGISTRATION_TRIES = defaultTries,
  REGISTRATION_RETRY_DELAY = defaultDelay,
  HEARTBEAT_ENDPOINT = "/heartbeat",
  HEARTBEAT_TRIES = defaultTries,
  HEARTBEAT_INTERVAL = defaultHeartbeatInterval,
  HEARTBEAT_RETRY_DELAY = defaultDelay,
  HEARTBEAT_TIMEOUT = defaultHeartbeatTimeout,
} = process.env;

if (SERVICE_URL === undefined) {
  logger.error("Environment variable SERVICE_URL is not defined.");
  process.exit(1);
}

if (LOCAL_PORT === undefined) {
  logger.error("Environment variable LOCAL_PORT is not defined.");
  process.exit(1);
}

if (SERVICE_MANAGER_URL === undefined) {
  logger.error("Environment variable SERVICE_MANAGER_URL is not defined.");
  process.exit(1);
}

if (BACKEND_API_KEY === undefined) {
  logger.error("Environment variable BACKEND_API_KEY is not defined.");
  process.exit(1);
}

if (BACKEND_API_KEY_HEADER === undefined) {
  logger.error("Environment variable BACKEND_API_KEY_HEADER is not defined.");
  process.exit(1);
}

export const config = {
  serviceUrl: SERVICE_URL.toString(),
  host: HOST.toString(),
  port: parseInt(LOCAL_PORT, 10),
  serviceManagerUrl: SERVICE_MANAGER_URL.toString(),
  backendApiKey: BACKEND_API_KEY.toString(),
  backendApiKeyHeader: BACKEND_API_KEY_HEADER.toString(),

  registrationEndpoint: REGISTRATION_ENDPOINT.toString(),
  registrationTries: parseInt(REGISTRATION_TRIES, 10),
  registrationRetryDelay: parseInt(REGISTRATION_RETRY_DELAY, 10),

  heartbeatEndpoint: HEARTBEAT_ENDPOINT.toString(),
  heartbeatTries: parseInt(HEARTBEAT_TRIES, 10),
  heartbeatInterval: parseInt(HEARTBEAT_INTERVAL, 10),
  heartbeatRetryDelay: parseInt(HEARTBEAT_RETRY_DELAY, 10),
  heartbeatTimeout: parseInt(HEARTBEAT_TIMEOUT, 10),
};
