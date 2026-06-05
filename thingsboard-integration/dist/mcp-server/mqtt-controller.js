"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceControllerMQTT = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
class DeviceControllerMQTT {
    constructor(brokerUrl, username, password) {
        this.brokerUrl = brokerUrl;
        this.username = username;
        this.password = password;
        this.client = null;
        this.pendingRPC = new Map();
        this.connect();
    }
    async connect() {
        try {
            const options = {
                clientId: `iot-mcp-server-${Date.now()}`,
                clean: true,
                connectTimeout: 30000,
                reconnectPeriod: 5000,
                username: this.username,
                password: this.password
            };
            this.client = mqtt_1.default.connect(this.brokerUrl, options);
            this.client.on('connect', () => {
                console.log('Connected to MQTT broker');
                this.subscribeToTopics();
            });
            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message.toString());
            });
            this.client.on('error', (error) => {
                console.error('MQTT connection error:', error);
            });
            this.client.on('offline', () => {
                console.warn('MQTT client offline');
            });
        }
        catch (error) {
            console.error('Failed to connect to MQTT broker:', error);
        }
    }
    subscribeToTopics() {
        if (!this.client)
            return;
        this.client.subscribe('v1/devices/+/rpc/response/+');
        this.client.subscribe('v1/gateway/rpc');
        this.client.subscribe('v1/devices/+/telemetry');
        this.client.subscribe('v1/gateway/telemetry');
    }
    handleMessage(topic, message) {
        try {
            const data = JSON.parse(message);
            if (topic.includes('/rpc/response/')) {
                this.handleRPCResponse(topic, data);
            }
            else if (topic.includes('/telemetry')) {
                this.handleTelemetryMessage(topic, data);
            }
        }
        catch (error) {
            console.error('Error parsing MQTT message:', error);
        }
    }
    handleRPCResponse(topic, data) {
        const requestIdMatch = topic.match(/\/rpc\/response\/(.+)$/);
        if (!requestIdMatch)
            return;
        const requestId = requestIdMatch[1];
        const pending = this.pendingRPC.get(requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRPC.delete(requestId);
            pending.resolve({
                success: true,
                response: data,
                timestamp: Date.now()
            });
        }
    }
    handleTelemetryMessage(topic, data) {
        const deviceIdMatch = topic.match(/v1\/devices\/(.+)\/telemetry/);
        if (!deviceIdMatch)
            return;
        const deviceId = deviceIdMatch[1];
        const telemetryMessage = {
            deviceId,
            telemetry: data,
            timestamp: Date.now()
        };
        console.log(`Telemetry received from ${deviceId}:`, data);
    }
    async sendRPCCommand(deviceId, method, params, timeout = 10000) {
        if (!this.client?.connected) {
            throw new Error('MQTT client not connected');
        }
        const requestId = `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const rpcTopic = `v1/devices/${deviceId}/rpc/request/${requestId}`;
        const rpcMessage = {
            method,
            params,
            requestId,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingRPC.delete(requestId);
                reject(new Error(`RPC command timeout for device ${deviceId}`));
            }, timeout);
            this.pendingRPC.set(requestId, {
                resolve,
                reject,
                timeout: timeoutHandle
            });
            this.client.publish(rpcTopic, JSON.stringify(rpcMessage), { qos: 1 }, (error) => {
                if (error) {
                    clearTimeout(timeoutHandle);
                    this.pendingRPC.delete(requestId);
                    reject(new Error(`Failed to send RPC command: ${error.message}`));
                }
            });
        });
    }
    async publishTelemetry(deviceId, telemetry) {
        if (!this.client?.connected) {
            throw new Error('MQTT client not connected');
        }
        const telemetryTopic = `v1/devices/${deviceId}/telemetry`;
        const message = JSON.stringify(telemetry);
        return new Promise((resolve, reject) => {
            this.client.publish(telemetryTopic, message, { qos: 1 }, (error) => {
                if (error) {
                    reject(new Error(`Failed to publish telemetry: ${error.message}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
        }
    }
}
exports.DeviceControllerMQTT = DeviceControllerMQTT;
//# sourceMappingURL=mqtt-controller.js.map