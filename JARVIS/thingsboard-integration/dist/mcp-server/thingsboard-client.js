"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThingsBoardClient = void 0;
const axios_1 = __importDefault(require("axios"));
class ThingsBoardClient {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.api = axios_1.default.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${token}`
            },
            timeout: 30000
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        this.api.interceptors.request.use((config) => {
            console.log(`[ThingsBoard API] ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        }, (error) => {
            console.error('[ThingsBoard API] Request error:', error);
            return Promise.reject(error);
        });
        this.api.interceptors.response.use((response) => {
            return response;
        }, (error) => {
            console.error('[ThingsBoard API] Response error:', error.response?.data || error.message);
            throw new Error(`ThingsBoard API Error: ${error.response?.data?.message || error.message}`);
        });
    }
    async getTelemetry(deviceId, keys, timeRange) {
        const endTs = Date.now();
        let startTs = endTs - (24 * 60 * 60 * 1000);
        if (timeRange) {
            const match = timeRange.match(/(\d+)([hdw])/);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2];
                switch (unit) {
                    case 'h':
                        startTs = endTs - (value * 60 * 60 * 1000);
                        break;
                    case 'd':
                        startTs = endTs - (value * 24 * 60 * 60 * 1000);
                        break;
                    case 'w':
                        startTs = endTs - (value * 7 * 24 * 60 * 60 * 1000);
                        break;
                }
            }
        }
        const response = await this.api.get(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`, {
            params: {
                keys: keys?.join(','),
                startTs,
                endTs,
                agg: 'NONE',
                limit: 1000
            }
        });
        return response.data;
    }
    async getLatestTelemetry(deviceId) {
        const response = await this.api.get(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`, {
            params: {
                useStrictDataTypes: true
            }
        });
        const latestData = {};
        Object.entries(response.data).forEach(([key, values]) => {
            if (Array.isArray(values) && values.length > 0) {
                latestData[key] = values[0].value;
                latestData[`${key}_timestamp`] = values[0].ts;
            }
        });
        return latestData;
    }
    async getDevicesByAsset(assetName) {
        const assetsResponse = await this.api.get('/api/tenant/assets', {
            params: {
                pageSize: 1000,
                page: 0,
                textSearch: assetName
            }
        });
        const asset = assetsResponse.data.data.find((a) => a.name.toLowerCase() === assetName.toLowerCase());
        if (!asset) {
            throw new Error(`Asset "${assetName}" not found`);
        }
        const devicesResponse = await this.api.get(`/api/relations/info`, {
            params: {
                fromId: asset.id.id,
                fromType: 'ASSET'
            }
        });
        const deviceIds = devicesResponse.data
            .filter((rel) => rel.to.entityType === 'DEVICE')
            .map((rel) => rel.to.id);
        const devices = [];
        for (const deviceId of deviceIds) {
            try {
                const deviceResponse = await this.api.get(`/api/device/${deviceId}`);
                devices.push({
                    id: deviceResponse.data.id.id,
                    name: deviceResponse.data.name,
                    type: deviceResponse.data.type,
                    label: deviceResponse.data.label,
                    assetId: asset.id.id,
                    additionalInfo: deviceResponse.data.additionalInfo
                });
            }
            catch (error) {
                console.warn(`Failed to get device ${deviceId}:`, error);
            }
        }
        return devices;
    }
    async saveDeviceAttributes(deviceId, attributes) {
        await this.api.post(`/api/plugins/telemetry/DEVICE/${deviceId}/SERVER_SCOPE`, attributes);
    }
    async getEnergyConsumption(timeRange, deviceIds) {
        const endTs = Date.now();
        let startTs = endTs - (24 * 60 * 60 * 1000);
        const match = timeRange.match(/(\d+)([hdw])/);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2];
            switch (unit) {
                case 'h':
                    startTs = endTs - (value * 60 * 60 * 1000);
                    break;
                case 'd':
                    startTs = endTs - (value * 24 * 60 * 60 * 1000);
                    break;
                case 'w':
                    startTs = endTs - (value * 7 * 24 * 60 * 60 * 1000);
                    break;
            }
        }
        let devices = [];
        if (deviceIds) {
            for (const deviceId of deviceIds) {
                const deviceResponse = await this.api.get(`/api/device/${deviceId}`);
                devices.push({
                    id: deviceId,
                    name: deviceResponse.data.name,
                    type: deviceResponse.data.type
                });
            }
        }
        else {
            const allDevicesResponse = await this.api.get('/api/tenant/devices', {
                params: { pageSize: 1000, page: 0 }
            });
            devices = allDevicesResponse.data.data.map((d) => ({
                id: d.id.id,
                name: d.name,
                type: d.type
            }));
        }
        const energyData = [];
        for (const device of devices) {
            try {
                const telemetryResponse = await this.api.get(`/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries`, {
                    params: {
                        keys: 'power_consumption,energy_usage,power_watts',
                        startTs,
                        endTs,
                        agg: 'AVG',
                        interval: 3600000
                    }
                });
                const powerData = telemetryResponse.data.power_consumption ||
                    telemetryResponse.data.energy_usage ||
                    telemetryResponse.data.power_watts || [];
                if (powerData.length > 0) {
                    const totalConsumption = powerData.reduce((sum, point) => sum + (point.value || 0), 0);
                    energyData.push({
                        deviceId: device.id,
                        deviceName: device.name,
                        totalConsumption,
                        hourlyData: powerData.map((point) => ({
                            timestamp: point.ts,
                            consumption: point.value || 0
                        }))
                    });
                }
            }
            catch (error) {
                console.warn(`Failed to get energy data for device ${device.id}:`, error);
            }
        }
        return energyData;
    }
    async createRuleChain(ruleChain) {
        const response = await this.api.post('/api/ruleChain', {
            name: ruleChain.name,
            type: 'CORE',
            configuration: {
                description: `AI-generated automation rule: ${ruleChain.name}`,
                triggers: ruleChain.triggers,
                actions: ruleChain.actions
            },
            debugMode: false,
            additionalInfo: {
                createdBy: ruleChain.createdBy,
                createdAt: ruleChain.createdAt
            }
        });
        return { id: response.data.id.id };
    }
    async getSecurityEvents(severity, timeRange, eventTypes) {
        const endTs = Date.now();
        let startTs = endTs - (24 * 60 * 60 * 1000);
        if (timeRange) {
            const match = timeRange.match(/(\d+)([hdw])/);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2];
                switch (unit) {
                    case 'h':
                        startTs = endTs - (value * 60 * 60 * 1000);
                        break;
                    case 'd':
                        startTs = endTs - (value * 24 * 60 * 60 * 1000);
                        break;
                    case 'w':
                        startTs = endTs - (value * 7 * 24 * 60 * 60 * 1000);
                        break;
                }
            }
        }
        const response = await this.api.get('/api/alarms/TENANT', {
            params: {
                pageSize: 1000,
                page: 0,
                startTime: startTs,
                endTime: endTs,
                searchStatus: 'ANY',
                sortProperty: 'createdTime',
                sortOrder: 'DESC'
            }
        });
        const alarms = response.data.data;
        let filteredAlarms = alarms;
        if (severity) {
            filteredAlarms = filteredAlarms.filter((alarm) => alarm.severity.toLowerCase() === severity.toLowerCase());
        }
        if (eventTypes && eventTypes.length > 0) {
            filteredAlarms = filteredAlarms.filter((alarm) => eventTypes.includes(alarm.type));
        }
        return filteredAlarms.map((alarm) => ({
            id: alarm.id.id,
            type: alarm.type,
            severity: alarm.severity.toLowerCase(),
            deviceId: alarm.originator?.id,
            message: alarm.details?.message || `${alarm.type} alarm`,
            timestamp: alarm.createdTime,
            acknowledged: alarm.acknowledged,
            details: alarm.details
        }));
    }
    async sendRPCCommand(deviceId, method, params, timeout = 10000) {
        const response = await this.api.post(`/api/rpc/twoway/${deviceId}`, {
            method,
            params,
            timeout
        });
        return response.data;
    }
    async testConnection() {
        try {
            await this.api.get('/api/auth/user');
            return true;
        }
        catch (error) {
            console.error('ThingsBoard connection test failed:', error);
            return false;
        }
    }
}
exports.ThingsBoardClient = ThingsBoardClient;
//# sourceMappingURL=thingsboard-client.js.map