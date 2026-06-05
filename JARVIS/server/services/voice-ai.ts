import OpenAI from "openai";
import type { DeviceControl } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ''
});

export interface VoiceCommandResult {
  success: boolean;
  transcription: string;
  response: string;
  audioResponse?: string; // Base64 encoded audio response
  deviceCommands?: DeviceControl[];
  deviceIds?: string[];
  message?: string;
}

class VoiceAIService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);
  }

  async processVoiceCommand(audioData: string, userId: string): Promise<VoiceCommandResult> {
    try {
      if (!this.isConfigured) {
        console.warn('OpenAI API key not configured');
        // Return mock response for development
        return {
          success: true,
          transcription: "Turn off the living room lights",
          response: "Living room lights turned off. Energy saving mode activated.",
          deviceCommands: [{
            deviceId: "living-room-lights",
            action: "toggle",
            value: false
          }],
          deviceIds: ["living-room-lights"]
        };
      }

      // Step 1: Transcribe audio using Whisper
      const transcriptionResult = await this.transcribeAudio(audioData);
      
      if (!transcriptionResult.text) {
        return {
          success: false,
          transcription: "",
          response: "Sorry, I couldn't understand what you said.",
          message: "Transcription failed"
        };
      }

      const transcription = transcriptionResult.text;
      const detectedLanguage = transcriptionResult.language;

      // Step 2: Process command with GPT-5 to understand intent and extract device commands
      const commandAnalysis = await this.analyzeCommand(transcription, detectedLanguage);
      
      // Step 3: Generate text response in the same language
      const textResponse = await this.generateResponse(transcription, commandAnalysis, detectedLanguage);
      
      // Step 4: Generate audio response using TTS with JARVIS-like voice
      const audioResponse = await this.generateAudioResponse(textResponse);

      return {
        success: true,
        transcription,
        response: textResponse,
        audioResponse,
        deviceCommands: commandAnalysis.deviceCommands,
        deviceIds: commandAnalysis.deviceIds
      };
    } catch (error) {
      console.error('Voice AI service error:', error);
      return {
        success: false,
        transcription: "",
        response: "Sorry, I encountered an error processing your request.",
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  private async transcribeAudio(audioData: string): Promise<{ text: string; language: string }> {
    try {
      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Create a temporary file-like object for the API
      const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "verbose_json", // This gives us language detection
      });

      // Extract language from the response (Whisper returns ISO language codes)
      const detectedLanguage = transcription.language || 'en';
      
      return {
        text: transcription.text,
        language: detectedLanguage
      };
    } catch (error) {
      console.error('Audio transcription error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  private async analyzeCommand(command: string, language: string): Promise<{
    deviceCommands: DeviceControl[];
    deviceIds: string[];
  }> {
    try {
      const systemPrompt = `You are a smart home AI assistant. Analyze voice commands and extract device control instructions.

Available devices and their IDs:
- living-room-lights (light): can toggle, set brightness (0-100)
- living-room-tv (tv): can toggle, set volume, change channel
- living-room-blinds (window): can toggle, set position (0-100)
- bedroom-night-light (light): can toggle, set brightness (0-100)
- bedroom-fan (fan): can toggle, set speed (1-5)
- kitchen-under-cabinet (light): can toggle, set brightness (0-100)
- kitchen-oven (appliance): can toggle, set temperature
- front-door-lock (lock): can lock/unlock
- front-door-camera (camera): can toggle recording

Actions available:
- toggle: turn on/off
- set_brightness: set light brightness (0-100)
- set_temperature: set temperature
- set_color: set light color

Return JSON with deviceCommands array containing objects with deviceId, action, and value (if needed).
The user is speaking in language code: ${language}. Understand the command regardless of language.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this command: "${command}"` }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        deviceCommands: result.deviceCommands || [],
        deviceIds: (result.deviceCommands || []).map((cmd: DeviceControl) => cmd.deviceId)
      };
    } catch (error) {
      console.error('Command analysis error:', error);
      return { deviceCommands: [], deviceIds: [] };
    }
  }

  private async generateResponse(command: string, analysis: any, language: string): Promise<string> {
    try {
      // Map common language codes to full names for better AI understanding
      const languageNames: { [key: string]: string } = {
        'en': 'English',
        'ar': 'Arabic',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'ko': 'Korean',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'it': 'Italian',
        'hi': 'Hindi',
        'tr': 'Turkish'
      };

      const languageName = languageNames[language] || 'English';
      
      const systemPrompt = `You are JARVIS, a sophisticated smart home AI assistant. Generate natural, friendly responses to voice commands in ${languageName}.
      
      CRITICAL: You MUST respond ONLY in ${languageName}, regardless of what language you think might be appropriate. The user spoke in ${languageName}, so you must respond in ${languageName}.
      
      Keep responses concise but informative. Confirm what actions were taken. Be professional and helpful like JARVIS from Iron Man.`;

      const deviceActions = analysis.deviceCommands.length > 0 
        ? `Actions to be taken: ${JSON.stringify(analysis.deviceCommands)}`
        : 'No device actions identified.';

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `User said in ${languageName}: "${command}"\n${deviceActions}\n\nGenerate a natural response in ${languageName}.`
          }
        ],
      });

      return response.choices[0].message.content || "Command processed.";
    } catch (error) {
      console.error('Response generation error:', error);
      return "Command processed successfully.";
    }
  }

  private async generateAudioResponse(text: string): Promise<string> {
    try {
      const response = await openai.audio.speech.create({
        model: "tts-1-hd", // Use the higher quality model for better JARVIS-like voice
        voice: "onyx", // Deep, authoritative voice - most JARVIS-like
        input: text,
        speed: 0.95, // Slightly slower for more commanding presence
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      return audioBuffer.toString('base64');
    } catch (error) {
      console.error('Audio generation error:', error);
      throw new Error('Failed to generate audio response');
    }
  }

  async startRealtimeSession(): Promise<{ sessionId: string; wsUrl: string }> {
    // TODO: Implement OpenAI real-time voice API session
    // This would create a WebSocket connection to OpenAI's real-time API
    const sessionId = `session_${Date.now()}`;
    const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
    
    return { sessionId, wsUrl };
  }
}

export const voiceAIService = new VoiceAIService();
