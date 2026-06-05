/**
 * ThingsBoard REST API Client
 * 
 * Handles communication with ThingsBoard platform for device management,
 * telemetry retrieval, and attribute management.
 */

import axios, { AxiosInstance } from 'axios';

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

/**
 * ThingsBoard API Client Class
 */
export class ThingsBoardClient {
  private api: AxiosInstance;
  private token: string;

  constructor(private baseUrl: string, token: string) {
    this.token = token;
    this.api = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${token}`
      },
      timeout: 30000
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for logging
    this.api.interceptors.request.use(
      (config) => {
        console.log(`[ThingsBoard API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[ThingsBoard API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        console.error('[ThingsBoard API] Response error:', error.response?.data || error.message);
        throw new Error(`ThingsBoard API Error: ${error.response?.data?.message || error.message}`);
      }
    );
  }

  /**
   * Get device telemetry data
   */
  async getTelemetry(deviceId: string, keys?: string[], timeRange?: string): Promise<TelemetryData> {
    const endTs = Date.now();
    let startTs = endTs - (24 * 60 * 60 * 1000); // Default to 24 hours

    // Parse time range
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

  /**
   * Get latest telemetry for a device
   */
  async getLatestTelemetry(deviceId: string): Promise<any> {
    const response = await this.api.get(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`, {
      params: {
        useStrictDataTypes: true
      }
    });

    // Transform to get latest values
    const latestData: any = {};
    Object.entries(response.data).forEach(([key, values]: [string, any]) => {
      if (Array.isArray(values) && values.length > 0) {
        latestData[key] = values[0].value;
        latestData[`${key}_timestamp`] = values[0].ts;
      }
    });

    return latestData;
  }

  /**
   * Get devices by asset (room)
   */
  async getDevicesByAsset(assetName: string): Promise<Device[]> {
    // First, find the asset by name
    const assetsResponse = await this.api.get('/api/tenant/assets', {
      params: {
        pageSize: 1000,
        page: 0,
        textSearch: assetName
      }
    });

    const asset = assetsResponse.data.data.find((a: any) => 
      a.name.toLowerCase() === assetName.toLowerCase()
    );

    if (!asset) {
      throw new Error(`Asset "${assetName}" not found`);
    }

    // Get devices assigned to this asset
    const devicesResponse = await this.api.get(`/api/relations/info`, {
      params: {
        fromId: asset.id.id,
        fromType: 'ASSET'
      }
    });

    const deviceIds = devicesResponse.data
      .filter((rel: any) => rel.to.entityType === 'DEVICE')
      .map((rel: any) => rel.to.id);

    // Get device details
    const devices: Device[] = [];
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
      } catch (error) {
        console.warn(`Failed to get device ${deviceId}:`, error);
      }
    }

    return devices;
  }

  /**
   * Save device attributes
   */
  async saveDeviceAttributes(deviceId: string, attributes: any): Promise<void> {
    await this.api.post(`/api/plugins/telemetry/DEVICE/${deviceId}/SERVER_SCOPE`, attributes);
  }

  /**
   * Get energy consumption data
   */
  async getEnergyConsumption(timeRange: string, deviceIds?: string[]): Promise<EnergyData[]> {
    const endTs = Date.now();
    let startTs = endTs - (24 * 60 * 60 * 1000);
    
    // Parse time range
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

    // If no specific devices, get all devices with power consumption telemetry
    let devices: Device[] = [];
    if (deviceIds) {
      for (const deviceId of deviceIds) {
        const deviceResponse = await this.api.get(`/api/device/${deviceId}`);
        devices.push({
          id: deviceId,
          name: deviceResponse.data.name,
          type: deviceResponse.data.type
        });
      }
    } else {
      // Get all tenant devices
      const allDevicesResponse = await this.api.get('/api/tenant/devices', {
        params: { pageSize: 1000, page: 0 }
      });
      devices = allDevicesResponse.data.data.map((d: any) => ({
        id: d.id.id,
        name: d.name,
        type: d.type
      }));
    }

    const energyData: EnergyData[] = [];

    for (const device of devices) {
      try {
        const telemetryResponse = await this.api.get(`/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries`, {
          params: {
            keys: 'power_consumption,energy_usage,power_watts',
            startTs,
            endTs,
            agg: 'AVG',
            interval: 3600000 // 1 hour intervals
          }
        });

        const powerData = telemetryResponse.data.power_consumption || 
                         telemetryResponse.data.energy_usage || 
                         telemetryResponse.data.power_watts || [];

        if (powerData.length > 0) {
          const totalConsumption = powerData.reduce((sum: number, point: any) => sum + (point.value || 0), 0);
          
          energyData.push({
            deviceId: device.id,
            deviceName: device.name,
            totalConsumption,
            hourlyData: powerData.map((point: any) => ({
              timestamp: point.ts,
              consumption: point.value || 0
            }))
          });
        }
      } catch (error) {
        console.warn(`Failed to get energy data for device ${device.id}:`, error);
      }
    }

    return energyData;
  }

  /**
   * Create a rule chain for automation
   */
  async createRuleChain(ruleChain: any): Promise<{ id: string }> {
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

  /**
   * Get security events and alarms
   */
  async getSecurityEvents(severity?: string, timeRange?: string, eventTypes?: string[]): Promise<SecurityEvent[]> {
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

    // Filter by severity
    if (severity) {
      filteredAlarms = filteredAlarms.filter((alarm: any) => 
        alarm.severity.toLowerCase() === severity.toLowerCase()
      );
    }

    // Filter by event types
    if (eventTypes && eventTypes.length > 0) {
      filteredAlarms = filteredAlarms.filter((alarm: any) => 
        eventTypes.includes(alarm.type)
      );
    }

    return filteredAlarms.map((alarm: any) => ({
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

  /**
   * Send RPC command to device
   */
  async sendRPCCommand(deviceId: string, method: string, params: any, timeout: number = 10000): Promise<any> {
    const response = await this.api.post(`/api/rpc/twoway/${deviceId}`, {
      method,
      params,
      timeout
    });

    return response.data;
  }

  /**
   * Test connection to ThingsBoard
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.api.get('/api/auth/user');
      return true;
    } catch (error) {
      console.error('ThingsBoard connection test failed:', error);
      return false;
    }
  }
}