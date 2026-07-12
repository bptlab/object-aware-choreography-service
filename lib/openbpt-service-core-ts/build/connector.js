"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToServiceManager = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("./config");
const request = axios_1.default.create({
    timeout: config_1.defaultAxiosTimeout,
    headers: {
        "Content-Type": "application/json",
        [config_1.config.backendApiKeyHeader]: config_1.config.backendApiKey,
    },
});
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function retry(fn, retriesLeft, interval, functionName) {
    try {
        return await fn();
    }
    catch (error) {
        // If no retries left, rethrow the error
        if (retriesLeft === 0) {
            throw error;
        }
        logger_1.default.warn(`Function (${functionName ? functionName : fn.name}) failed. Retry in ${interval} ms. Retries left: ${retriesLeft - 1}`);
        await sleep(interval);
        if (retriesLeft === -1) {
            return retry(fn, retriesLeft, interval, functionName);
        }
        return retry(fn, retriesLeft - 1, interval, functionName);
    }
}
async function connectToServiceManager(manifest) {
    const repeatForever = true;
    while (repeatForever) {
        try {
            await retry(() => registerAtServiceManager(manifest), config_1.config.registrationTries, config_1.config.registrationRetryDelay, "registerAtServiceManager");
            logger_1.default.info(`Successfully registered at service manager (${config_1.config.serviceManagerUrl})`);
            try {
                await monitorConnection(manifest.id);
            }
            catch (error) {
                logger_1.default.error("Failed to maintain connection to service manager. Trying to re-register.");
                logger_1.default.error(error);
            }
        }
        catch (error) {
            logger_1.default.error("Failed to register at service manager.");
            logger_1.default.error(error);
            process.exit(1);
        }
    }
}
exports.connectToServiceManager = connectToServiceManager;
async function monitorConnection(serviceId) {
    const repeatForever = true;
    while (repeatForever) {
        const success = await retry(() => heartbeat(serviceId), config_1.config.heartbeatTries, config_1.config.heartbeatRetryDelay, "heartbeat");
        if (success === false) {
            logger_1.default.warn("Service manager rejected heartbeat. Trying to re-register.");
            return false;
        }
        await sleep(config_1.config.heartbeatInterval);
    }
    return undefined;
}
async function heartbeat(serviceId) {
    const url = `${config_1.config.serviceManagerUrl}/${serviceId}${config_1.config.heartbeatEndpoint}`;
    try {
        await request.post(url);
        return true;
    }
    catch (error) {
        const response = error.response;
        if (response && response.status === 400) {
            return false;
        }
        throw error;
    }
}
async function registerAtServiceManager(manifest) {
    const url = `${config_1.config.serviceManagerUrl}${config_1.config.registrationEndpoint}`;
    return request.post(url, {
        manifest,
    });
}
