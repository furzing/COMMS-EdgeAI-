export interface RPCResult {
    success: boolean;
    response?: any;
    error?: string;
    timestamp: number;
}
export interface TelemetryMessage {
    deviceId: string;
    telemetry: Record<string, any>;
    timestamp: number;
}
export declare class DeviceControllerMQTT {
    private brokerUrl;
    private username?;
    private password?;
    private client;
    private pendingRPC;
    constructor(brokerUrl: string, username?: string, password?: string);
    private connect;
    private subscribeToTopics;
    private handleMessage;
    private handleRPCResponse;
    private handleTelemetryMessage;
    sendRPCCommand(deviceId: string, method: string, params: any, timeout?: number): Promise<RPCResult>;
    publishTelemetry(deviceId: string, telemetry: Record<string, any>): Promise<void>;
    disconnect(): void;
}
//# sourceMappingURL=mqtt-controller.d.ts.map