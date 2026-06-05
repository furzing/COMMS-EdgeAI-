import type { DeviceControl } from "@shared/schema";

export interface DeviceControlResult {
  success: boolean;
  isActive: boolean;
  status: Record<string, any>;
  message?: string;
}

class DeviceControlService {
  async controlDevice(deviceId: string, control: DeviceControl): Promise<DeviceControlResult> {
    try {
      // Simulate device control - in a real implementation, this would
      // communicate with actual IoT devices via their respective protocols
      // (Zigbee, Z-Wave, WiFi, etc.)
      
      switch (control.action) {
        case 'toggle':
          return this.toggleDevice(deviceId, control.value as boolean);
          
        case 'set_brightness':
          return this.setBrightness(deviceId, control.value as number);
          
        case 'set_temperature':
          return this.setTemperature(deviceId, control.value as number);
          
        case 'set_color':
          return this.setColor(deviceId, control.value as string);
          
        default:
          return {
            success: false,
            isActive: false,
            status: {},
            message: `Unknown action: ${control.action}`
          };
      }
    } catch (error) {
      console.error(`Device control error for ${deviceId}:`, error);
      return {
        success: false,
        isActive: false,
        status: {},
        message: error instanceof Error ? error.message : 'Device control failed'
      };
    }
  }

  private async toggleDevice(deviceId: string, targetState?: boolean): Promise<DeviceControlResult> {
    // Simulate device toggle with different behavior for different device types
    const deviceType = this.getDeviceType(deviceId);
    
    switch (deviceType) {
      case 'light':
        const lightState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: lightState,
          status: { 
            brightness: lightState ? 80 : 0,
            lastToggled: new Date().toISOString()
          }
        };
        
      case 'tv':
        const tvState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: tvState,
          status: {
            channel: tvState ? "Netflix" : null,
            volume: tvState ? 25 : 0,
            lastToggled: new Date().toISOString()
          }
        };
        
      case 'window':
        const windowState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: windowState,
          status: {
            position: windowState ? 75 : 0,
            lastToggled: new Date().toISOString()
          }
        };
        
      case 'fan':
        const fanState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: fanState,
          status: {
            speed: fanState ? 2 : 0,
            lastToggled: new Date().toISOString()
          }
        };
        
      case 'lock':
        const lockState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: lockState,
          status: {
            locked: lockState,
            lastToggled: new Date().toISOString()
          }
        };
        
      default:
        const defaultState = targetState ?? !this.getCurrentState(deviceId);
        return {
          success: true,
          isActive: defaultState,
          status: {
            lastToggled: new Date().toISOString()
          }
        };
    }
  }

  private async setBrightness(deviceId: string, brightness: number): Promise<DeviceControlResult> {
    if (brightness < 0 || brightness > 100) {
      return {
        success: false,
        isActive: false,
        status: {},
        message: 'Brightness must be between 0 and 100'
      };
    }

    return {
      success: true,
      isActive: brightness > 0,
      status: {
        brightness,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private async setTemperature(deviceId: string, temperature: number): Promise<DeviceControlResult> {
    if (temperature < 32 || temperature > 100) {
      return {
        success: false,
        isActive: false,
        status: {},
        message: 'Temperature must be between 32°F and 100°F'
      };
    }

    return {
      success: true,
      isActive: temperature > 32,
      status: {
        temperature,
        mode: 'heat',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private async setColor(deviceId: string, color: string): Promise<DeviceControlResult> {
    // Validate color format (hex, rgb, color name)
    const validColor = /^#[0-9A-F]{6}$/i.test(color) || 
                      /^rgb\(\d+,\s*\d+,\s*\d+\)$/i.test(color) ||
                      ['red', 'green', 'blue', 'white', 'warm', 'cool'].includes(color.toLowerCase());

    if (!validColor) {
      return {
        success: false,
        isActive: false,
        status: {},
        message: 'Invalid color format'
      };
    }

    return {
      success: true,
      isActive: true,
      status: {
        color,
        brightness: 80,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private getDeviceType(deviceId: string): string {
    if (deviceId.includes('light')) return 'light';
    if (deviceId.includes('tv')) return 'tv';
    if (deviceId.includes('blinds') || deviceId.includes('window')) return 'window';
    if (deviceId.includes('fan')) return 'fan';
    if (deviceId.includes('lock')) return 'lock';
    if (deviceId.includes('camera')) return 'camera';
    if (deviceId.includes('thermostat')) return 'thermostat';
    if (deviceId.includes('oven')) return 'appliance';
    return 'generic';
  }

  private getCurrentState(deviceId: string): boolean {
    // In a real implementation, this would query the actual device state
    // For now, simulate based on device ID
    return Math.random() > 0.5;
  }
}

export const deviceControlService = new DeviceControlService();
