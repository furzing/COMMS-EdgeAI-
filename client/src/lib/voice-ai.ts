import { apiRequest } from "@/lib/queryClient";

export interface VoiceAIConfig {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface VoiceCommand {
  id: string;
  userId: string;
  command: string;
  response?: string;
  deviceIds?: string[];
  success: boolean;
  createdAt: string;
}

export interface VoiceProcessingResult {
  success: boolean;
  transcription: string;
  response: string;
  audioResponse?: string;
  deviceCommands?: Array<{
    deviceId: string;
    action: string;
    value?: any;
  }>;
  deviceIds?: string[];
  message?: string;
}

export class VoiceAIClient {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private config: VoiceAIConfig;

  constructor(config: VoiceAIConfig = {}) {
    this.config = {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...config,
    };
  }

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
        },
      });

      // Reset audio chunks
      this.audioChunks = [];

      // Create MediaRecorder with optimal settings for voice
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
    } catch (error) {
      console.error('Error starting voice recording:', error);
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording to stop'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        });
        
        // Clean up resources
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  async processVoiceCommand(audioBlob: Blob, userId: string): Promise<VoiceProcessingResult> {
    try {
      // Convert blob to base64
      const base64Audio = await this.blobToBase64(audioBlob);
      
      // Send to backend for processing
      const response = await apiRequest('POST', '/api/voice/command', {
        audioData: base64Audio,
        userId,
      });

      return await response.json();
    } catch (error) {
      console.error('Voice command processing error:', error);
      throw new Error('Failed to process voice command');
    }
  }

  async getVoiceCommands(userId: string, limit?: number): Promise<VoiceCommand[]> {
    try {
      const url = limit ? `/api/voice/commands/${userId}?limit=${limit}` : `/api/voice/commands/${userId}`;
      const response = await apiRequest('GET', url);
      return await response.json();
    } catch (error) {
      console.error('Error fetching voice commands:', error);
      throw new Error('Failed to fetch voice commands');
    }
  }

  playAudioResponse(base64Audio: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert base64 to blob
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Failed to play audio response'));
        };

        audio.play().catch(reject);
      } catch (error) {
        console.error('Error playing audio response:', error);
        reject(new Error('Failed to create audio from response data'));
      }
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }
    
    this.audioChunks = [];
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64 data
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback - most browsers support this
    return 'audio/webm';
  }
}

// Utility functions for voice AI integration
export const voiceAIUtils = {
  // Check if browser supports required APIs
  isSupported(): boolean {
    return !!(
      navigator.mediaDevices && 
      navigator.mediaDevices.getUserMedia && 
      window.MediaRecorder &&
      window.AudioContext || window.webkitAudioContext
    );
  },

  // Get available audio input devices
  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Error getting audio input devices:', error);
      return [];
    }
  },

  // Check microphone permissions
  async checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
      if (!navigator.permissions) {
        return 'prompt';
      }
      
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      return 'prompt';
    }
  },

  // Format duration for display
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  },

  // Validate audio blob
  isValidAudioBlob(blob: Blob): boolean {
    return blob.size > 0 && blob.type.startsWith('audio/');
  },

  // Create audio visualization data
  createVisualizationData(audioData: number[], barCount: number = 6): number[] {
    if (!audioData || audioData.length === 0) {
      return new Array(barCount).fill(0.1);
    }

    const chunkSize = Math.floor(audioData.length / barCount);
    const bars: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      const chunk = audioData.slice(start, end);
      
      // Calculate RMS (Root Mean Square) for this chunk
      const rms = Math.sqrt(
        chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length
      );
      
      // Normalize to 0-1 range and add minimum height
      bars.push(Math.max(0.1, Math.min(1, rms)));
    }

    return bars;
  }
};

// Export singleton instance
export const voiceAI = new VoiceAIClient();
