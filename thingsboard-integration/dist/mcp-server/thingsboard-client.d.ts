export interface Device {
    id: string;
    name: string;
    type: string;
    label?: string;
    assetId?: string;
    customerId?: string;
    additionalInfo?: any;
}
export interface TelemetryData {
    [key: string]: Array<{
        ts: number;
        value: string | number | boolean;
    }>;
}
export interface SecurityEvent {
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    deviceId?: string;
    message: string;
    timestamp: number;
    acknowledged: boolean;
    details: any;
}
export interface EnergyData {
    deviceId: string;
    deviceName: string;
    totalConsumption: number;
    hourlyData: Array<{
        timestamp: number;
        consumption: number;
    }>;
}
export declare class ThingsBoardClient {
    private baseUrl;
    private api;
    private token;
    constructor(baseUrl: string, token: string);
    private setupInterceptors;
    getTelemetry(deviceId: string, keys?: string[], timeRange?: string): Promise<TelemetryData>;
    getLatestTelemetry(deviceId: string): Promise<any>;
    getDevicesByAsset(assetName: string): Promise<Device[]>;
    saveDeviceAttributes(deviceId: string, attributes: any): Promise<void>;
    getEnergyConsumption(timeRange: string, deviceIds?: string[]): Promise<EnergyData[]>;
    createRuleChain(ruleChain: any): Promise<{
        id: string;
    }>;
    getSecurityEvents(severity?: string, timeRange?: string, eventTypes?: string[]): Promise<SecurityEvent[]>;
    sendRPCCommand(deviceId: string, method: string, params: any, timeout?: number): Promise<any>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=thingsboard-client.d.ts.map