export interface MCPServerConfig {
    thingsBoardUrl: string;
    thingsBoardToken: string;
    mqttBrokerUrl: string;
    mqttUsername?: string;
    mqttPassword?: string;
}
export declare class ThingsBoardMCPServer {
    private config;
    private server;
    private tbClient;
    private mqttController;
    private telemetryProcessor;
    constructor(config: MCPServerConfig);
    private setupHandlers;
    private getDeviceTelemetry;
    private controlDevice;
    private getDevicesByRoom;
    private analyzeEnergyUsage;
    private createAutomationRule;
    private getSecurityEvents;
    private isDeviceOnline;
    private generateRoomSummary;
    private calculateThreatLevel;
    private generateSecurityRecommendations;
    start(): Promise<void>;
}
export { ThingsBoardMCPServer };
//# sourceMappingURL=thingsboard-connector.d.ts.map