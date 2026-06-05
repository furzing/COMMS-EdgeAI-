/**
 * MQTT Device Controller
 * 
 * Handles MQTT communication for real-time device control and telemetry
 */

import mqtt, { MqttClient } from 'mqtt';

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

export class DeviceControllerMQTT {
  private client: MqttClient | null = null;
  private pendingRPC: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

  constructor(
    private brokerUrl: string,
    private username?: string,
    private password?: string
  ) {
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const options: mqtt.IClientOptions = {
        clientId: `iot-mcp-server-${Date.now()}`,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 5000,
        username: this.username,
        password: this.password
      };

      this.client = mqtt.connect(this.brokerUrl, options);

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

    } catch (error) {
      console.error('Failed to connect to MQTT broker:', error);
    }
  }

  private subscribeToTopics(): void {
    if (!this.client) return;

    // Subscribe to RPC response topics
    this.client.subscribe('v1/devices/+/rpc/response/+');
    this.client.subscribe('v1/gateway/rpc');
    
    // Subscribe to telemetry topics
    this.client.subscribe('v1/devices/+/telemetry');
    this.client.subscribe('v1/gateway/telemetry');
  }

  private handleMessage(topic: string, message: string): void {
    try {
      const data = JSON.parse(message);
      
      if (topic.includes('/rpc/response/')) {
        this.handleRPCResponse(topic, data);
      } else if (topic.includes('/telemetry')) {
        this.handleTelemetryMessage(topic, data);
      }
    } catch (error) {
      console.error('Error parsing MQTT message:', error);
    }
  }

  private handleRPCResponse(topic: string, data: any): void {
    const requestIdMatch = topic.match(/\/rpc\/response\/(.+)$/);
    if (!requestIdMatch) return;
    
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

  private handleTelemetryMessage(topic: string, data: any): void {
    const deviceIdMatch = topic.match(/v1\/devices\/(.+)\/telemetry/);
    if (!deviceIdMatch) return;
    
    const deviceId = deviceIdMatch[1];
    const telemetryMessage: TelemetryMessage = {
      deviceId,
      telemetry: data,
      timestamp: Date.now()
    };
    
    // Emit telemetry event for other components to consume
    console.log(`Telemetry received from ${deviceId}:`, data);
  }

  async sendRPCCommand(deviceId: string, method: string, params: any, timeout: number = 10000): Promise<RPCResult> {
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

      this.client!.publish(rpcTopic, JSON.stringify(rpcMessage), { qos: 1 }, (error) => {
        if (error) {
          clearTimeout(timeoutHandle);
          this.pendingRPC.delete(requestId);
          reject(new Error(`Failed to send RPC command: ${error.message}`));
        }
      });
    });
  }

  async publishTelemetry(deviceId: string, telemetry: Record<string, any>): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('MQTT client not connected');
    }

    const telemetryTopic = `v1/devices/${deviceId}/telemetry`;
    const message = JSON.stringify(telemetry);

    return new Promise((resolve, reject) => {
      this.client!.publish(telemetryTopic, message, { qos: 1 }, (error) => {
        if (error) {
          reject(new Error(`Failed to publish telemetry: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}