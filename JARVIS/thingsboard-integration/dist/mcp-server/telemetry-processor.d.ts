export interface TelemetrySummary {
    deviceCount: number;
    averageTemperature?: number;
    totalEnergyConsumption?: number;
    onlineDevices: number;
    offlineDevices: number;
    alerts: string[];
}
export interface EnergyAnalysis {
    totalKwh: number;
    averageDailyKwh: number;
    peakUsageTime: string;
    topConsumers: Array<{
        deviceId: string;
        consumption: number;
    }>;
    optimizationSuggestions: string[];
    estimatedMonthlyCost: number;
    carbonFootprintKg: number;
}
export interface SecurityAnalysis {
    threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    activeThreats: number;
    recommendations: string[];
    affectedDevices: string[];
}
export declare class TelemetryProcessor {
    processRawTelemetry(rawData: any): any;
    generateTelemetrySummary(telemetryData: any): TelemetrySummary;
    analyzeEnergyPatterns(energyData: any[]): EnergyAnalysis;
    analyzeSecurityEvents(events: any[]): any[];
    private getSecurityContext;
    calculateDeviceHealthScore(telemetryData: any): number;
    generateMaintenanceRecommendations(telemetryData: any): string[];
}
//# sourceMappingURL=telemetry-processor.d.ts.map