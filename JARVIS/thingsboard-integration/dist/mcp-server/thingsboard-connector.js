"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThingsBoardMCPServer = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const thingsboard_client_js_1 = require("./thingsboard-client.js");
const mqtt_controller_js_1 = require("./mqtt-controller.js");
const telemetry_processor_js_1 = require("./telemetry-processor.js");
class ThingsBoardMCPServer {
    constructor(config) {
        this.config = config;
        this.server = new index_js_1.Server({
            name: 'thingsboard-iot-server',
            version: '1.0.0',
            description: 'MCP server for ThingsBoard IoT platform integration with OpenAI'
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {}
            }
        });
        this.tbClient = new thingsboard_client_js_1.ThingsBoardClient(config.thingsBoardUrl, config.thingsBoardToken);
        this.mqttController = new mqtt_controller_js_1.DeviceControllerMQTT(config.mqttBrokerUrl, config.mqttUsername, config.mqttPassword);
        this.telemetryProcessor = new telemetry_processor_js_1.TelemetryProcessor();
        this.setupHandlers();
    }
    setupHandlers() {
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get_device_telemetry',
                    description: 'Retrieve real-time telemetry data from IoT devices',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            deviceId: { type: 'string', description: 'ThingsBoard device ID' },
                            keys: { type: 'array', items: { type: 'string' }, description: 'Telemetry keys to retrieve' },
                            timeRange: { type: 'string', description: 'Time range (1h, 24h, 7d)' }
                        },
                        required: ['deviceId']
                    }
                },
                {
                    name: 'control_device',
                    description: 'Send RPC commands to control IoT devices',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            deviceId: { type: 'string', description: 'ThingsBoard device ID' },
                            method: { type: 'string', description: 'RPC method name' },
                            params: { type: 'object', description: 'RPC parameters' },
                            timeout: { type: 'number', description: 'Timeout in milliseconds', default: 10000 }
                        },
                        required: ['deviceId', 'method']
                    }
                },
                {
                    name: 'get_devices_by_room',
                    description: 'Get all devices in a specific room or location',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            roomName: { type: 'string', description: 'Room or location name' },
                            deviceType: { type: 'string', description: 'Filter by device type (optional)' }
                        },
                        required: ['roomName']
                    }
                },
                {
                    name: 'analyze_energy_usage',
                    description: 'Analyze energy consumption patterns and provide insights',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            timeRange: { type: 'string', description: 'Analysis time range (24h, 7d, 30d)' },
                            deviceIds: { type: 'array', items: { type: 'string' }, description: 'Specific devices to analyze' }
                        },
                        required: ['timeRange']
                    }
                },
                {
                    name: 'create_automation_rule',
                    description: 'Create intelligent automation rules based on telemetry data',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            ruleName: { type: 'string', description: 'Name for the automation rule' },
                            triggers: { type: 'array', description: 'Trigger conditions' },
                            actions: { type: 'array', description: 'Actions to execute' },
                            enabled: { type: 'boolean', default: true }
                        },
                        required: ['ruleName', 'triggers', 'actions']
                    }
                },
                {
                    name: 'get_security_events',
                    description: 'Retrieve security-related events and anomalies',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                            timeRange: { type: 'string', description: 'Time range for events' },
                            eventTypes: { type: 'array', items: { type: 'string' } }
                        }
                    }
                }
            ]
        }));
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'get_device_telemetry':
                        return await this.getDeviceTelemetry(args.deviceId, args.keys, args.timeRange);
                    case 'control_device':
                        return await this.controlDevice(args.deviceId, args.method, args.params, args.timeout);
                    case 'get_devices_by_room':
                        return await this.getDevicesByRoom(args.roomName, args.deviceType);
                    case 'analyze_energy_usage':
                        return await this.analyzeEnergyUsage(args.timeRange, args.deviceIds);
                    case 'create_automation_rule':
                        return await this.createAutomationRule(args.ruleName, args.triggers, args.actions, args.enabled);
                    case 'get_security_events':
                        return await this.getSecurityEvents(args.severity, args.timeRange, args.eventTypes);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ]
                };
            }
        });
    }
    async getDeviceTelemetry(deviceId, keys, timeRange) {
        const telemetryData = await this.tbClient.getTelemetry(deviceId, keys, timeRange);
        const processedData = this.telemetryProcessor.processRawTelemetry(telemetryData);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        deviceId,
                        telemetry: processedData,
                        summary: this.telemetryProcessor.generateTelemetrySummary(processedData),
                        timestamp: new Date().toISOString()
                    }, null, 2)
                }
            ]
        };
    }
    async controlDevice(deviceId, method, params, timeout = 10000) {
        const rpcResult = await this.mqttController.sendRPCCommand(deviceId, method, params, timeout);
        await this.tbClient.saveDeviceAttributes(deviceId, {
            lastCommand: method,
            lastCommandParams: params,
            lastCommandTime: new Date().toISOString(),
            commandSource: 'ai_assistant'
        });
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        deviceId,
                        command: method,
                        params,
                        result: rpcResult,
                        success: rpcResult.success,
                        timestamp: new Date().toISOString()
                    }, null, 2)
                }
            ]
        };
    }
    async getDevicesByRoom(roomName, deviceType) {
        const devices = await this.tbClient.getDevicesByAsset(roomName);
        const filteredDevices = deviceType
            ? devices.filter(device => device.type === deviceType)
            : devices;
        const devicesWithStatus = await Promise.all(filteredDevices.map(async (device) => {
            const latestTelemetry = await this.tbClient.getLatestTelemetry(device.id);
            return {
                ...device,
                status: latestTelemetry,
                isOnline: this.isDeviceOnline(latestTelemetry)
            };
        }));
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        room: roomName,
                        deviceType,
                        deviceCount: devicesWithStatus.length,
                        devices: devicesWithStatus,
                        roomSummary: this.generateRoomSummary(devicesWithStatus)
                    }, null, 2)
                }
            ]
        };
    }
    async analyzeEnergyUsage(timeRange, deviceIds) {
        const energyData = await this.tbClient.getEnergyConsumption(timeRange, deviceIds);
        const analysis = this.telemetryProcessor.analyzeEnergyPatterns(energyData);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        timeRange,
                        totalConsumption: analysis.totalKwh,
                        averageDaily: analysis.averageDailyKwh,
                        peakUsageTime: analysis.peakUsageTime,
                        topConsumers: analysis.topConsumers,
                        suggestions: analysis.optimizationSuggestions,
                        estimatedMonthlyCost: analysis.estimatedMonthlyCost,
                        carbonFootprint: analysis.carbonFootprintKg
                    }, null, 2)
                }
            ]
        };
    }
    async createAutomationRule(ruleName, triggers, actions, enabled = true) {
        const ruleChain = {
            name: ruleName,
            enabled,
            triggers: triggers.map(trigger => ({
                type: trigger.type,
                condition: trigger.condition,
                deviceFilters: trigger.deviceFilters || []
            })),
            actions: actions.map(action => ({
                type: action.type,
                deviceId: action.deviceId,
                method: action.method,
                params: action.params
            })),
            createdBy: 'ai_assistant',
            createdAt: new Date().toISOString()
        };
        const createdRule = await this.tbClient.createRuleChain(ruleChain);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        ruleName,
                        ruleId: createdRule.id,
                        status: 'created',
                        triggers: triggers.length,
                        actions: actions.length,
                        enabled,
                        message: `Automation rule "${ruleName}" has been successfully created and ${enabled ? 'enabled' : 'disabled'}.`
                    }, null, 2)
                }
            ]
        };
    }
    async getSecurityEvents(severity, timeRange, eventTypes) {
        const events = await this.tbClient.getSecurityEvents(severity, timeRange, eventTypes);
        const processedEvents = this.telemetryProcessor.analyzeSecurityEvents(events);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        totalEvents: events.length,
                        severity,
                        timeRange,
                        events: processedEvents,
                        threatLevel: this.calculateThreatLevel(processedEvents),
                        recommendations: this.generateSecurityRecommendations(processedEvents)
                    }, null, 2)
                }
            ]
        };
    }
    isDeviceOnline(telemetry) {
        if (!telemetry.lastSeen)
            return false;
        const lastSeen = new Date(telemetry.lastSeen);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
        return diffMinutes < 5;
    }
    generateRoomSummary(devices) {
        const onlineDevices = devices.filter(d => d.isOnline).length;
        const offlineDevices = devices.length - onlineDevices;
        const deviceTypes = [...new Set(devices.map(d => d.type))];
        return `Room contains ${devices.length} devices (${onlineDevices} online, ${offlineDevices} offline). Device types: ${deviceTypes.join(', ')}`;
    }
    calculateThreatLevel(events) {
        const criticalEvents = events.filter(e => e.severity === 'critical').length;
        const highEvents = events.filter(e => e.severity === 'high').length;
        if (criticalEvents > 0)
            return 'CRITICAL';
        if (highEvents > 2)
            return 'HIGH';
        if (highEvents > 0)
            return 'MEDIUM';
        return 'LOW';
    }
    generateSecurityRecommendations(events) {
        const recommendations = [];
        if (events.some(e => e.type === 'unauthorized_access')) {
            recommendations.push('Review access logs and consider changing device passwords');
        }
        if (events.some(e => e.type === 'device_offline')) {
            recommendations.push('Check network connectivity for offline security devices');
        }
        if (events.some(e => e.type === 'motion_detected')) {
            recommendations.push('Verify motion detection events and adjust sensor sensitivity if needed');
        }
        return recommendations;
    }
    async start() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.log('ThingsBoard MCP Server started successfully');
    }
}
exports.ThingsBoardMCPServer = ThingsBoardMCPServer;
//# sourceMappingURL=thingsboard-connector.js.map