"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.defaultTries = exports.defaultAxiosTimeout = exports.defaultHeartbeatInterval = exports.defaultHeartbeatTimeout = exports.defaultDelay = void 0;
const logger_1 = __importDefault(require("./logger"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: `.env.${process.env.NODE_ENV}` });
exports.defaultDelay = "5000"; // 5 seconds
exports.defaultHeartbeatTimeout = "60000"; // 60 seconds
exports.defaultHeartbeatInterval = "30000"; // 30 seconds
exports.defaultAxiosTimeout = 1000; // 1 second
exports.defaultTries = "5";
const { SERVICE_URL, HOST = "localhost", LOCAL_PORT, SERVICE_MANAGER_URL, BACKEND_API_KEY, BACKEND_API_KEY_HEADER, REGISTRATION_ENDPOINT = "/register", REGISTRATION_TRIES = exports.defaultTries, REGISTRATION_RETRY_DELAY = exports.defaultDelay, HEARTBEAT_ENDPOINT = "/heartbeat", HEARTBEAT_TRIES = exports.defaultTries, HEARTBEAT_INTERVAL = exports.defaultHeartbeatInterval, HEARTBEAT_RETRY_DELAY = exports.defaultDelay, HEARTBEAT_TIMEOUT = exports.defaultHeartbeatTimeout, } = process.env;
if (SERVICE_URL === undefined) {
    logger_1.default.error("Environment variable SERVICE_URL is not defined.");
    process.exit(1);
}
if (LOCAL_PORT === undefined) {
    logger_1.default.error("Environment variable LOCAL_PORT is not defined.");
    process.exit(1);
}
if (SERVICE_MANAGER_URL === undefined) {
    logger_1.default.error("Environment variable SERVICE_MANAGER_URL is not defined.");
    process.exit(1);
}
if (BACKEND_API_KEY === undefined) {
    logger_1.default.error("Environment variable BACKEND_API_KEY is not defined.");
    process.exit(1);
}
if (BACKEND_API_KEY_HEADER === undefined) {
    logger_1.default.error("Environment variable BACKEND_API_KEY_HEADER is not defined.");
    process.exit(1);
}
exports.config = {
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
