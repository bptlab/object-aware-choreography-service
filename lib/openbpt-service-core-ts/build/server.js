"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = void 0;
const fastify_1 = __importDefault(require("fastify"));
const routes_1 = require("./routes");
const connector_1 = require("./connector");
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("./config");
function init(manifest, runFunction) {
    const fastify = (0, fastify_1.default)({});
    fastify.register(routes_1.routes, { manifest, runFunction });
    // Start the server
    fastify.listen({ port: config_1.config.port, host: config_1.config.host }, (error) => {
        if (error) {
            logger_1.default.error(error);
            process.exit(1);
        }
        (0, connector_1.connectToServiceManager)(manifest);
    });
}
exports.init = init;
