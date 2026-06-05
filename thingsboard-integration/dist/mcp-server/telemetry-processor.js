"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryProcessor = void 0;
class TelemetryProcessor {
    processRawTelemetry(rawData) {
        const processed = {};
        Object.entries(rawData).forEach(([key, values]) => {
            if (Array.isArray(values) && values.length > 0) {
                const latestValue = values[0];
                processed[key] = {
                    value: latestValue.value,
                    timestamp: latestValue.ts,
                    dataType: typeof latestValue.value
                };
                if (key === 'temperature' && typeof latestValue.value === 'number') {
                    processed[`${key}_fahrenheit`] = {
                        value: (latestValue.value * 9 / 5) + 32,
                        timestamp: latestValue.ts,
                        dataType: 'number'
                    };
                }
                if (key === 'power_consumption') {
                    processed[`${key}_kwh`] = {
                        value: latestValue.value / 1000,
                        timestamp: latestValue.ts,
                        dataType: 'number'
                    };
                }
            }
        });
        return processed;
    }
    generateTelemetrySummary(telemetryData) {
        const summary = {
            deviceCount: 1,
            onlineDevices: 1,
            offlineDevices: 0,
            alerts: []
        };
        if (telemetryData.temperature) {
            const temp = telemetryData.temperature.value;
            summary.averageTemperature = temp;
            if (temp > 35) {
                summary.alerts.push(`High temperature detected: ${temp}°C`);
            }
            else if (temp < 0) {
                summary.alerts.push(`Freezing temperature detected: ${temp}°C`);
            }
        }
        if (telemetryData.power_consumption) {
            summary.totalEnergyConsumption = telemetryData.power_consumption.value;
            if (telemetryData.power_consumption.value > 1000) {
                summary.alerts.push(`High power consumption: ${telemetryData.power_consumption.value}W`);
            }
        }
        const lastSeen = telemetryData.lastSeen || telemetryData.timestamp;
        if (lastSeen) {
            const now = Date.now();
            const diffMinutes = (now - lastSeen) / (1000 * 60);
            if (diffMinutes > 5) {
                summary.onlineDevices = 0;
                summary.offlineDevices = 1;
                summary.alerts.push('Device appears to be offline');
            }
        }
        return summary;
    }
    analyzeEnergyPatterns(energyData) {
        if (energyData.length === 0) {
            return {
                totalKwh: 0,
                averageDailyKwh: 0,
                peakUsageTime: 'N/A',
                topConsumers: [],
                optimizationSuggestions: ['No energy data available'],
                estimatedMonthlyCost: 0,
                carbonFootprintKg: 0
            };
        }
        const totalConsumption = energyData.reduce((sum, device) => sum + device.totalConsumption, 0);
        const totalKwh = totalConsumption / 1000;
        const averageDailyKwh = totalKwh / 7;
        const hourlyTotals = {};
        energyData.forEach(device => {
            device.hourlyData?.forEach((point) => {
                const hour = new Date(point.timestamp).getHours();
                hourlyTotals[hour] = (hourlyTotals[hour] || 0) + point.consumption;
            });
        });
        const peakHour = Object.entries(hourlyTotals).reduce((max, [hour, consumption]) => consumption > max.consumption ? { hour: parseInt(hour), consumption } : max, { hour: 0, consumption: 0 });
        const peakUsageTime = `${peakHour.hour}:00`;
        const topConsumers = energyData
            .sort((a, b) => b.totalConsumption - a.totalConsumption)
            .slice(0, 5)
            .map(device => ({
            deviceId: device.deviceId,
            consumption: device.totalConsumption
        }));
        const optimizationSuggestions = [];
        if (peakHour.hour >= 18 && peakHour.hour <= 21) {
            optimizationSuggestions.push('Consider using energy-intensive devices outside peak hours (6-9 PM)');
        }
        if (totalKwh > 50) {
            optimizationSuggestions.push('High energy usage detected. Consider upgrading to energy-efficient appliances');
        }
        const highConsumers = topConsumers.filter(device => device.consumption > totalConsumption * 0.2);
        if (highConsumers.length > 0) {
            optimizationSuggestions.push(`Review usage patterns for high-consumption devices: ${highConsumers.map(d => d.deviceId).join(', ')}`);
        }
        const estimatedMonthlyCost = (totalKwh * 4) * 0.12;
        const carbonFootprintKg = totalKwh * 0.5;
        return {
            totalKwh,
            averageDailyKwh,
            peakUsageTime,
            topConsumers,
            optimizationSuggestions,
            estimatedMonthlyCost,
            carbonFootprintKg
        };
    }
    analyzeSecurityEvents(events) {
        return events.map(event => {
            const analyzed = { ...event };
            if (event.type === 'unauthorized_access') {
                analyzed.riskScore = 9;
                analyzed.urgency = 'IMMEDIATE';
            }
            else if (event.type === 'device_offline' && event.details?.deviceType === 'security_camera') {
                analyzed.riskScore = 7;
                analyzed.urgency = 'HIGH';
            }
            else if (event.type === 'motion_detected') {
                analyzed.riskScore = 3;
                analyzed.urgency = 'LOW';
            }
            else {
                analyzed.riskScore = 5;
                analyzed.urgency = 'MEDIUM';
            }
            analyzed.context = this.getSecurityContext(event);
            return analyzed;
        });
    }
    getSecurityContext(event) {
        const contexts = [];
        if (event.timestamp) {
            const hour = new Date(event.timestamp).getHours();
            if (hour >= 22 || hour <= 6) {
                contexts.push('Occurred during night hours');
            }
        }
        if (event.deviceId) {
            contexts.push(`Device: ${event.deviceId}`);
        }
        if (event.type === 'motion_detected' && event.details?.location) {
            contexts.push(`Location: ${event.details.location}`);
        }
        return contexts.join(', ');
    }
    calculateDeviceHealthScore(telemetryData) {
        let healthScore = 100;
        const lastSeen = telemetryData.lastSeen || telemetryData.timestamp;
        if (lastSeen) {
            const now = Date.now();
            const diffMinutes = (now - lastSeen) / (1000 * 60);
            if (diffMinutes > 60)
                healthScore -= 30;
            else if (diffMinutes > 10)
                healthScore -= 15;
        }
        if (telemetryData.battery_level) {
            const batteryLevel = telemetryData.battery_level.value;
            if (batteryLevel < 20)
                healthScore -= 25;
            else if (batteryLevel < 50)
                healthScore -= 10;
        }
        if (telemetryData.error_count) {
            const errorCount = telemetryData.error_count.value;
            if (errorCount > 10)
                healthScore -= 20;
            else if (errorCount > 5)
                healthScore -= 10;
        }
        if (telemetryData.temperature) {
            const temp = telemetryData.temperature.value;
            if (temp > 60 || temp < -20)
                healthScore -= 15;
        }
        return Math.max(0, healthScore);
    }
    generateMaintenanceRecommendations(telemetryData) {
        const recommendations = [];
        if (telemetryData.battery_level && telemetryData.battery_level.value < 30) {
            recommendations.push('Battery level low - schedule replacement soon');
        }
        if (telemetryData.firmware_version) {
            const currentVersion = telemetryData.firmware_version.value;
            if (typeof currentVersion === 'string' && currentVersion.includes('1.')) {
                recommendations.push('Firmware update available - consider upgrading for improved features');
            }
        }
        if (telemetryData.memory_usage && telemetryData.memory_usage.value > 85) {
            recommendations.push('High memory usage detected - device may need restart');
        }
        if (telemetryData.signal_strength && telemetryData.signal_strength.value < -70) {
            recommendations.push('Weak signal strength - consider relocating device or improving network coverage');
        }
        return recommendations;
    }
}
exports.TelemetryProcessor = TelemetryProcessor;
//# sourceMappingURL=telemetry-processor.js.map